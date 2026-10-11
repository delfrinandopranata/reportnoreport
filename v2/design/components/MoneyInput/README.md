# Money input

An amount field with the ISO currency code inside it. `rnr-field` > `label.rnr-label` + `div.rnr-money` > `input.rnr-input` + `span.rnr-money-code`. Plus `rnr-amt` for a read-only figure.

## Anatomy
Standard 48px `rnr-input`, radius 10. The code ("MYR") sits inside the left edge in Plex Mono `--ink-3`; the value is right-aligned in Plex Mono, tabular. Input is `type="text" inputmode="decimal" autocomplete="off"` so phones show a number pad and "1,234.50" can be typed. The code is decoration for sight and is named for assistive tech through `aria-describedby` on a hint ("Amount in MYR"). The stored value is integer minor units; the field shows major units with two decimals on blur (per currency exponent).

## States
rest · hover · focus (border and ring in `--focus`) · filled · invalid (`aria-invalid="true"`, outline `--down`, error sentence with icon below) · disabled · readonly. Pair with the `rnr-seg` receipt / payment toggle: the sign is chosen by the toggle, so the field takes a positive amount only.

## Display
Format with the ISO code first, the true minus for negatives: "−MYR 120.00". `rnr-amt` is the same figure as text: mono, tabular, right-aligned in a table cell; `data-neg` turns it `--down` (the minus stays).

## Do
Keep the label above ("Amount"). Say what is wrong ("Enter an amount greater than 0."). Round-trip through the repo's `makeMoney` formatter; never `toFixed` by hand. Cap at the product limit and say so.

## Don't
Don't use a symbol (RM, $). Don't use `type="number"` (spinners, locale). Don't show a hyphen for a minus. Don't put the code outside the field.

## Accessibility
Visible label, 4.5:1 text, error linked with `aria-describedby`, 48px target. The code span is not focusable.

## Copy
Label "Amount". Hint "Amount in MYR". Errors: "Enter an amount greater than 0.", "That amount is too large."
