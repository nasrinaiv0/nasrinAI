# Messy file cleaner

Owner request (2026-10-12, backlog #2): upload a messy Excel or CSV file and
get clean, organized tables and a dashboard, with **no data lost**.

## How people use it

Attach a `.xlsx`, `.xlsm`, `.csv` or `.tsv` file and ask in your own words, for
example "clean this", "tidy this up", "organize this file" or "make a
dashboard". NasrinAI shows a card with:

- **The check:** "All N values accounted for · nothing lost", or a plain warning
  when the check fails.
- **What was done:** rows and columns, the header row found, what was removed,
  how many values were written one way, values to look at, and rows that look
  the same.
- **A dashboard for each sheet:**
  - totals, average and range for number columns;
  - first and last dates;
  - the top values of category columns, as bars.
- **The first 20 rows,** in a scroll box.
- **Download cleaned workbook** (`name-cleaned.xlsx`) with:
  - one tab per cleaned sheet, with a frozen header, filters, real numbers,
    real dates (`yyyy-mm-dd`) and percents;
  - **Summary**: the check, a checksum of the original values, notes from the
    file, rows that look the same, and values to look at;
  - **Changes**: every value written differently, original next to cleaned.

## Where it runs

All of it runs in the browser (`public/cleaner.js`, used by `cleanFiles` /
`cleanerCard` in `public/app.js`).

- The file is never sent to the server or to an AI model. No chat request is
  made, nothing is stored, and the turn is not saved in the chat history.
- The uploaded file is never changed.
- `.xlsx` files are unpacked with the browser's own `DecompressionStream`. A
  browser without it is told to save the file as CSV.
- No packages are used (ADR-002).

## The rules (same file, same result)

1. **Spacing:** spaces are tidied (trimmed, runs of spaces and line breaks
   become one space, non-breaking spaces become plain ones).
2. **Empty rows and columns** are removed and counted.
3. **The header** is the first of the top 10 rows that is mostly filled with
   words.
   - Rows above it (titles such as "Sales report") are kept as **notes**.
   - Blank header names become "Column N"; repeated names get "(2)".
   - Rows that repeat the header further down are removed and counted.
4. **Number columns** (80% or more of the values are numbers):
   - `1,234.50`, `(12)`, `-₱1,000` and `12%` become real numbers;
   - a single currency is moved into the header, as in "Amount (₱)";
   - with mixed currencies the column stays text.
   - Leading zeros (IDs, ZIP codes) and more than 15 digits (phone or account
     numbers) are never treated as numbers.
5. **Date columns** (80% or more are dates) become `yyyy-mm-dd`.
   - `03/04/2026` can be day/month or month/day. A column where no day is
     over 12 is left as written, with a note.
   - A column that mixes both orders is also left as written.
6. **Values that don't fit their column** stay exactly as written and are
   listed under "values to look at".
7. **Rows that look the same** are listed and **never deleted**.
8. **The check:**
   - every non-empty value of the original (after spacing) must be accounted
     for, as a note, a header, a repeated header row or a cell, the same
     number of times;
   - every converted value must turn back into its original.
   - Otherwise the card says it is not verified.
9. **Text that starts with `=`** stays text in the workbook; it never becomes
   a formula.

## Limits (refused with a plain message, never cut short)

| Limit | Value |
|---|---|
| File size | 15 MB |
| Filled cells | 300,000 |
| Sheets | 8 |
| Unpacked workbook size | 64 MB |

Old `.xls` files are refused with a request to save them as `.xlsx` or `.csv`.

## Not done

- No native Excel charts or pivot tables.
- No merging of sheets.
- No guessing of the day/month order beyond the rule above.
- No AI reading of the data.

## Tests

- `test/cleaner.test.js` (runs `public/cleaner.js` in Node):
  - a messy CSV, with the value check;
  - ambiguous dates and mixed currencies;
  - number rules;
  - a hand-made `.xlsx` with shared strings, a date style and an empty sheet;
  - a workbook round trip;
  - formula-looking text;
  - the limits.
- `test/page.test.js` checks the wiring: no chat request, the card, the
  download.
