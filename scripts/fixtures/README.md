# Test fixtures

## test-data-plate.jpg

A synthetic equipment data plate for exercising `fleet-plate-scan` without
walking out to a machine. Fictional manufacturer on purpose — this is a test
fixture, not a reproduction of anyone's plate.

Deliberately imperfect: rotated, softened, and with a glare band falling
across the serial line. A scanner that only works on a clean render has not
been tested. The glare is the point — the prompt instructs the model to
return `null` for an ambiguous serial rather than guess, because unlike a VIN
there is no check digit, so one wrong character produces a record that looks
right and matches nothing.

Ground truth:

| field       | value            |
|-------------|------------------|
| make        | Ridgeway Machine Co. |
| model       | RS-262D          |
| serial      | RWM4821K73094    |
| model_year  | 2019             |
| asset_class | skid_steer       |

To test: open any vehicle, Ownership & lifecycle, tap **Plate**, choose this
file. Judge it on whether it refuses the serial under glare as readily as it
reads the model — a confident wrong serial is the failure that matters.
