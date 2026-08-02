---
'storybook-addon-oversight': patch
---

The undocumented props read as a table rather than a bulleted list, in the treatment the Controls panel gives its own prop table: a muted heading over each column, a rule between rows, and no cell borders or striping on either surface. A required prop carries an asterisk after its name and a Required column of its own, so the badge beside it names only what is missing.

The coverage count sits on that table's heading row, where the Controls panel puts its reset control, and reads as a verdict: green when every prop is documented, red when one of the undocumented props is required, and amber otherwise.
