import { describe, it, expect } from 'vitest'
import {
  attachmentKind, rejectReason, attachmentBlock, buildMessageContent,
  withCurrentTurn, toApiMessages, attachmentNote, describeAttachments,
  MAX_PDF_BYTES, ATTACHMENT_HISTORY_TURNS,
} from './chatAttachments'

const img = (name = 'shot.png') => ({ id: name, name, kind: 'image', mediaType: 'image/png', data: 'AAA' })
const pdf = (name = 'bill.pdf') => ({ id: name, name, kind: 'pdf', mediaType: 'application/pdf', data: 'BBB' })

describe('what we accept', () => {
  it('takes screenshots, photos and PDFs', () => {
    expect(attachmentKind({ type: 'image/png', name: 'a.png' })).toBe('image')
    expect(attachmentKind({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image')
    expect(attachmentKind({ type: 'application/pdf', name: 'a.pdf' })).toBe('pdf')
  })

  it('falls back to the extension when the browser reports no type', () => {
    // Files picked from Google Drive / OneDrive on Android arrive with type ''.
    // Rejecting those would look like the button is broken.
    expect(attachmentKind({ type: '', name: 'invoice.PDF' })).toBe('pdf')
    expect(attachmentKind({ type: '', name: 'photo.JPEG' })).toBe('image')
  })

  it('turns down what the model cannot read', () => {
    expect(attachmentKind({ type: 'application/zip', name: 'a.zip' })).toBe(null)
    expect(rejectReason({ type: 'application/zip', name: 'a.zip' })).toMatch(/photo, a screenshot, or a PDF/)
  })

  it('explains a too-big file in plain words with its size', () => {
    const reason = rejectReason({ type: 'application/pdf', name: 'huge.pdf', size: MAX_PDF_BYTES + 1 })
    expect(reason).toContain('huge.pdf')
    expect(reason).toMatch(/10\.0 MB/)
  })
})

describe('content blocks', () => {
  it('sends an image as an image block', () => {
    expect(attachmentBlock(img())).toEqual({
      type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
    })
  })

  it('sends a PDF as a document block', () => {
    expect(attachmentBlock(pdf())).toEqual({
      type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' },
    })
  })

  it('leaves a plain message a plain string', () => {
    // The overwhelmingly common path must stay byte-identical to before —
    // this is a live assistant used every day and attachments are the exception.
    expect(buildMessageContent('how many jobs today?', [])).toBe('how many jobs today?')
  })

  it('names the file so Arnie can refer back to it', () => {
    const content = buildMessageContent('what is this?', [img('panel.png')])
    expect(content[0].type).toBe('image')
    expect(content[1]).toEqual({ type: 'text', text: 'what is this?' })
  })

  it('gives an image with no caption a real question', () => {
    // Someone drops a screenshot and hits send. A bare image block with an
    // empty text block is rejected by the API.
    const content = buildMessageContent('', [img('error.png')])
    expect(content[1].text).toContain('error.png')
    expect(content[1].text.trim()).not.toBe('')
  })
})

describe('the duplicated turn', () => {
  // ArnieChat's history ref already contains the message being sent. Appending
  // it produced two user turns; the edge function merged them, so Claude saw
  // the question twice. An attachment turn cannot be merged that way.
  it('replaces the copy already in history instead of appending', () => {
    const history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '' }, { role: 'user', content: 'what is this' }]
    const out = withCurrentTurn(history, 'what is this', [img()])
    expect(out).toHaveLength(3)
    expect(out[2].attachments).toHaveLength(1)
  })

  it('still appends when the ref has not caught up', () => {
    const history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hey boss' }]
    expect(withCurrentTurn(history, 'what is this', [])).toHaveLength(3)
  })

  it('never eats a turn that carried its own files', () => {
    const history = [{ role: 'user', content: 'read this', attachments: [pdf()] }]
    const out = withCurrentTurn(history, 'read this', [])
    expect(out).toHaveLength(2)
    expect(out[0].attachments).toHaveLength(1)
  })
})

describe('building the request', () => {
  it('drops the empty assistant placeholder', () => {
    // ArnieChat adds a blank assistant bubble to stream into. Sent as-is it
    // would be an empty turn.
    const out = toApiMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '' },
    ])
    expect(out).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('keeps a message that is nothing but a file', () => {
    const out = toApiMessages([{ role: 'user', content: '', attachments: [img()] }])
    expect(out).toHaveLength(1)
    expect(Array.isArray(out[0].content)).toBe(true)
  })

  it('ages old images out to a note so the request stops growing', () => {
    // Every image is ~1600 tokens. Carried forever, a long conversation costs
    // more every turn until it fails outright.
    const convo = []
    for (let i = 0; i < 6; i++) {
      convo.push({ role: 'user', content: `q${i}`, attachments: [img(`p${i}.png`)] })
      convo.push({ role: 'assistant', content: `a${i}` })
    }
    const out = toApiMessages(convo)
    const withBlocks = out.filter(m => Array.isArray(m.content))
    expect(withBlocks).toHaveLength(ATTACHMENT_HISTORY_TURNS)

    // The oldest still says a file was there, so Arnie doesn't act as though
    // the conversation began out of nowhere.
    expect(out[0].content).toContain('p0.png')
    expect(out[0].content).toContain('q0')
  })

  it('keeps the newest attachments, not the oldest', () => {
    const convo = []
    for (let i = 0; i < 5; i++) {
      convo.push({ role: 'user', content: `q${i}`, attachments: [img(`p${i}.png`)] })
      convo.push({ role: 'assistant', content: 'ok' })
    }
    const out = toApiMessages(convo)
    const last = out.filter(m => Array.isArray(m.content)).pop()
    expect(last.content.some(b => b.type === 'image')).toBe(true)
    expect(out[out.length - 2].content).not.toBe('q4')  // q4 became blocks
  })

  it('leaves an all-text conversation exactly as it was', () => {
    const convo = [
      { role: 'user', content: 'how many jobs' },
      { role: 'assistant', content: '12' },
      { role: 'user', content: 'and last month' },
    ]
    expect(toApiMessages(convo)).toEqual(convo)
  })
})

describe('what gets written to the transcript', () => {
  it('records the filenames, because the files themselves are not stored', () => {
    expect(attachmentNote([img('a.png'), pdf('b.pdf')])).toBe('_[attached: a.png, b.pdf]_')
    expect(describeAttachments([img('a.png')])).toBe('a.png')
  })

  it('adds nothing when nothing was attached', () => {
    expect(attachmentNote([])).toBe('')
  })
})
