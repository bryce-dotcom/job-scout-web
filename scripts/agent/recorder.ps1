# The recorder — what the person did, as a stream of events.
#
# Runs as ONE long-lived process and writes NDJSON to stdout, a line per
# event. The agent reads those lines. Spawning a shell per poll would cost
# tens of milliseconds and miss most clicks, so this loop stays resident and
# only the interesting moments cross the boundary.
#
# WHAT IT NEVER EMITS: the characters somebody typed. It counts them and
# reports a count. A demonstration runs through real screens with real
# customers on them, and the one thing worse than a brittle step list is a
# step list with somebody's data baked into it.
#
# Typing is aggregated rather than reported keystroke by keystroke: a person
# filling a field produces forty events that mean one thing ("they typed into
# this box"), and the boundary is a click, a Tab, an Enter, or the window
# changing — which is exactly where one field ends and the next begins.
#
# CONTROL IS A FILE, not stdin, and OUTPUT IS FLUSHED BY HAND. Both of those
# are scars. PowerShell block-buffers stdout when it is redirected, so events
# sat in a buffer and only appeared when the process was killed; and
# [Console]::In.Peek() blocks on a redirected stdin, so a recorder that waited
# on it stopped watching the screen. The agent writes one word into the
# control file — pause, resume, stop — and this polls it.

param(
  [Parameter(Mandatory = $true)][string]$ControlFile
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

# One line out, immediately. Write-Output goes through the pipeline to a
# buffered host stream; this does not.
function Say($text) {
  [Console]::Out.WriteLine($text)
  [Console]::Out.Flush()
}

Add-Type -Namespace JS -Name Win -MemberDefinition @'
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
'@

$VK_LBUTTON = 0x01
$VK_RBUTTON = 0x02
$VK_RETURN  = 0x0D
$VK_TAB     = 0x09
$VK_ESCAPE  = 0x1B

$seq = 0
$paused = $false
$typed = 0
$lastClickAt = [DateTime]::MinValue
$lastApp = ''
$lastTitle = ''

function Now { (Get-Date).ToUniversalTime().ToString('o') }

function Front {
  $h = [JS.Win]::GetForegroundWindow()
  $procId = 0
  [void][JS.Win]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = New-Object System.Text.StringBuilder 512
  [void][JS.Win]::GetWindowText($h, $sb, 512)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = '' }
  return @{ app = $name; title = $sb.ToString() }
}

function Emit($kind, $extra) {
  $script:seq++
  $f = Front
  $o = @{
    seq = $script:seq
    at = Now
    kind = $kind
    app = $f.app
    window_title = $f.title
  }
  if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
  # Compress so one event is one line; the agent splits on newlines.
  Say ($o | ConvertTo-Json -Compress -Depth 4)
}

# A run of typing becomes one observation when it ends. Called at every
# boundary so the count belongs to the field it was typed into.
function FlushTyping {
  if ($script:typed -gt 0) {
    Emit 'type' @{ text_length = $script:typed }
    $script:typed = 0
  }
}

# Edge detection: GetAsyncKeyState's low bit says "pressed since last call",
# so each key is asked about exactly once per pass or presses are lost.
$wasDown = @{}
function Pressed($vk) {
  $s = [JS.Win]::GetAsyncKeyState($vk)
  $down = ($s -band 0x8000) -ne 0
  $before = $false
  if ($wasDown.ContainsKey($vk)) { $before = $wasDown[$vk] }
  $wasDown[$vk] = $down
  return ($down -and -not $before)
}

Emit 'started' $null

while ($true) {
  # Control channel: a one-word file the agent rewrites. Reading it cannot
  # block, which is the whole reason it is not stdin.
  $cmd = ''
  try { if (Test-Path $ControlFile) { $cmd = (Get-Content $ControlFile -Raw -ErrorAction Stop).Trim() } } catch { $cmd = '' }
  switch ($cmd) {
    'pause'  { if (-not $paused) { FlushTyping; Emit 'paused' $null; $paused = $true } }
    'resume' { if ($paused) { $paused = $false; Emit 'resumed' $null } }
    'stop'   { FlushTyping; Emit 'stopped' $null; exit 0 }
  }

  if ($paused) { Start-Sleep -Milliseconds 120; continue }

  # The window changing is itself a step — it is how "now go to the other
  # tab" shows up in a recording.
  $f = Front
  if ($f.app -ne $lastApp -or $f.title -ne $lastTitle) {
    FlushTyping
    if ($lastApp -ne '') { Emit 'app_change' $null }
    $lastApp = $f.app
    $lastTitle = $f.title
  }

  if (Pressed $VK_LBUTTON) {
    FlushTyping
    $p = [System.Windows.Forms.Cursor]::Position
    $gap = ([DateTime]::UtcNow - $lastClickAt).TotalMilliseconds
    $kind = 'click'
    if ($gap -lt 400) { $kind = 'double_click' }
    $lastClickAt = [DateTime]::UtcNow
    Emit $kind @{ x = $p.X; y = $p.Y }
  }
  elseif (Pressed $VK_RBUTTON) {
    FlushTyping
    $p = [System.Windows.Forms.Cursor]::Position
    Emit 'right_click' @{ x = $p.X; y = $p.Y }
  }
  else {
    # The three keys that END a field, reported by name because they are
    # structural — Tab moves on, Enter commits, Escape abandons.
    if (Pressed $VK_RETURN) { FlushTyping; Emit 'key' @{ key_name = 'enter' } }
    elseif (Pressed $VK_TAB) { FlushTyping; Emit 'key' @{ key_name = 'tab' } }
    elseif (Pressed $VK_ESCAPE) { FlushTyping; Emit 'key' @{ key_name = 'escape' } }
    else {
      # Everything else printable is counted, never kept.
      for ($vk = 0x20; $vk -le 0x5A; $vk++) {
        if (Pressed $vk) { $script:typed++; break }
      }
    }
  }

  Start-Sleep -Milliseconds 35
}
