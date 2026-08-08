# What the agent actually receives

Oversight lints the components manifest. An agent never reads that manifest. It reads markdown that Storybook's MCP server renders from it, and the two are not the same document: the server reformats what it serves and drops what it will not.

This page records that transform, field by field. It exists because a rule can otherwise fire on something the server discards, or stay silent about something the server mangles, and neither shows up in a lint count.

Nothing here is a claim about what a model does with the text. See [What this does not establish](#what-this-does-not-establish).

## How this was measured

Against `@storybook/mcp` 0.8.0, the version `@storybook/addon-mcp` 0.7.0 pins, with Storybook 10.5.7.

The measurements come from invoking the server's exported tool registrars against an in-memory manifest, so the text below is produced by the shipped code path rather than by a reimplementation of it. The formatters themselves are internal to `@storybook/mcp` and cannot be imported. `packages/mcp-projection` holds the harness, the variants, and a snapshot of every rendering described here; `pnpm test:unit` runs it.

The baseline is the real `actions-button` entry from a `storybook build` of the demo. Every variant mutates that one entry, so a difference in output is attributable to the single field that changed.

## What reaches the agent

Three tools serve component documentation, and the server sends an instruction block alongside them at initialize. The instruction block matters as much as the data:

> **CRITICAL: Never hallucinate component properties!** Before using ANY property on a component (even common-sounding ones like `shadow`), you MUST verify it is documented via these tools. If it is not documented, it does not exist, never assume props from naming conventions or other libraries; report it to the user instead.

That sentence is what makes an omitted field consequential rather than merely absent. A component rendered without a `## Props` section is not described as undocumented. It is described as having no props.

`list-all-documentation` is the only surface a component is selected from. `get-documentation` is what an agent reads once it has chosen. A field that survives only into the second one cannot influence selection.

## Which fields survive

Measured by marking each field with a unique value and looking for it in the output.

| Manifest field | `list-all-documentation` | `get-documentation` |
| --- | --- | --- |
| `id` | kept | kept, as `ID: <id>` |
| `name` | kept | kept, as the heading |
| `description` | truncated to 90 characters | kept verbatim, untruncated |
| `summary` | kept, and takes precedence over `description` | dropped |
| `<payload>.props[].description` | not shown | kept, as a JSDoc block |
| `<payload>.props[].type` | not shown | kept, as the TypeScript type |
| `<payload>.props[].required` | not shown | kept, as the presence or absence of `?` |
| `<payload>.props[].defaultValue` | not shown | kept, as `= <value>` |
| `stories[].name` / `.id` / `.snippet` | ids only, with `withStoryIds` | kept, capped at three |
| `import` | dropped | kept, inside the story code fences only |
| `subcomponents` | dropped | kept, including their errors |
| `error` | dropped | **dropped** |
| `jsDocTags` | dropped | dropped |
| `path` | dropped | dropped |
| `<payload>.filePath` | dropped | dropped |
| `<payload>.tags` | dropped | dropped |
| `<payload>.displayName` | dropped | dropped |
| `<payload>.methods` | dropped | dropped |
| `props[].parent` / `.declarations` | dropped | dropped |
| `meta` (top level) | dropped | dropped |

The entry's own `error` is the row to notice. The server preserves it through resolution and then never renders it, while rendering the same field on a subcomponent.

## Where each rule lands

Three buckets, describing the payload only:

- **signalled**, the call fails or returns `isError`
- **distinguishable**, the text differs from a healthy component's
- **indistinguishable**, the text is byte-identical to a healthy component's
- **not agent-visible**, the field the rule reads never reaches either tool

| Rule | What the agent receives | Bucket |
| --- | --- | --- |
| `docgen-missing` | heading, id and stories; no `## Props`, no error text | indistinguishable |
| `props-unrecorded` | the same bytes as above | indistinguishable |
| `story-extraction-error` | with no snippet, the story vanishes from `get-documentation` and `get-documentation-for-story` returns an empty string with `isError` false; with a snippet, the story renders as though nothing went wrong | indistinguishable |
| `component-description-missing` | a bare `- Name (id)` line among siblings carrying summaries, and no description paragraph | distinguishable |
| `prop-descriptions-missing` | the prop keeps its name, type, optionality and default; only the JSDoc block is gone | distinguishable |
| `required-prop-undocumented` | the same, on a prop rendered without `?` | distinguishable |
| `docs-link-dangling` | the link is verbatim in `get-documentation`, and truncated out of the selection list when the description runs past 90 characters | distinguishable, but only after selection |
| `ref-unresolved` | the whole call fails and the component is lost | signalled |
| `extractor-drift` | `meta.docgen` is dropped | not agent-visible |
| `unknown-ignore-rule` | `jsDocTags` is dropped | not agent-visible |
| `deprecated-tag` | `jsDocTags` and payload `tags` are both dropped | not agent-visible |

`prop-shape-unrecognized` is not measured here. It fires only on ref manifests, and the server runs its own prop parsers rather than the ones the rule guards, so what it renders under a moved shape is not established.

## Three failure modes that render identically

An entry carrying an extraction error, an entry with no payload and no error, and an entry whose payload records no props all produce the same bytes, with `isError` false on each. The manifests differ; the output does not.

```
# Button

ID: actions-button

## Stories
...
```

No `## Props` section, and no trace of the recorded diagnosis. `docgen-missing` is an error and `props-unrecorded` is a warning, and an agent has nothing to tell them apart with.

The inverse case is `ref-unresolved`, a warning: on a ref manifest a dangling `$ref` throws out of the tool call, so the failure is loud and the component is withheld rather than served as a healthy one with nothing in it.

## Truncation and caps

- Descriptions in the selection list are cut at **90 characters**, mid-word, with an ellipsis. Truncation counts the raw string including newlines, so an entry can wrap across several lines and the list cannot be parsed a line at a time.
- A redirect written at the end of a description, the convention [Authoring](./authoring.md#redirect-between-components-that-get-confused) prescribes, is therefore cut from the selection list whenever the description runs long. It survives only into `get-documentation`.
- `get-documentation` shows **three** stories in full, then names the rest. The cap applies only when the component has props; a component with none has every story rendered in full.
- Stories with no snippet appear nowhere in `get-documentation`, not even in the trailing list. A story is filtered on its snippet rather than on its error, so a story recording an error but keeping its snippet is rendered in full, with the error omitted.
- There is no pagination and no size cap on either tool.

## A prop can be misstated rather than omitted

A prop whose `required` and `type` never reached the manifest is not skipped. It renders as `name: any;`, which reads as **required, of type any**, because the formatter defaults `required` to true and `type` to `any` when neither is recorded. No Oversight rule covers this.

## What this does not establish

This page describes bytes. It says nothing about what a model does with them, and no rule severity should be justified from it as though it did.

Specifically untested: whether a model obeys the instruction block when the props section is missing, whether a bare line loses a selection against summarized siblings, whether the 90-character truncation changes which component gets chosen, and whether a prop rendered as `any` induces a bogus argument. Those need a model in the loop and controls, and none has been run.

Where this page says an agent "cannot tell" two states apart, that is a statement about the payload carrying no difference, not a prediction about behavior.
