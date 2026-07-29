---
'oversight-lint': minor
'storybook-addon-oversight': patch
---

Say what was linted, and collapse mass extraction failures in text output. The stylish output now opens with the manifest path and its recorded extractor, and the tally counts affected manifest entries; JSON output gains `summary.manifest` (`path`, `docgen`). When findings of one rule share an error signature across at least 10 findings and half the manifest's entries, text output renders one line per signature naming the count, the share, and the diagnosis, while `--format json` keeps every per-entry finding. Extraction-failure messages now lead with the manifest error's `name` and append the message's first line when it adds information; the full error text stays on the finding's `error` field, and the name rides along on `errorName`. The message change lives in `oversight-core` and reaches the addon panel, hence the patch.
