---
'oversight-lint': patch
---

Document the fourth exit-2 case. A path that parses as JSON but records no
`components` has exited 2 since 0.6.0; the README still described three cases,
and npm renders the README frozen at publish time, so the correction only
reaches anyone on a release.
