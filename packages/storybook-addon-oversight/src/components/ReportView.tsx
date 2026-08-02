import { Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { CheckIcon, CrossIcon } from '@storybook/icons';
import { Badge, EmptyTabContent } from 'storybook/internal/components';
import { styled } from 'storybook/theming';
import type { ComponentReport, Finding, Severity } from 'oversight-core';
import { summarizeError } from 'oversight-core';
import { parseInline, splitParagraphs, storybookPathId } from './markdown';

/** A context-appropriate link to a `?path=/docs|story/<id>` target. The manager
 *  navigates via `api.selectStory`. Only needed by the "full" variant. */
export type LinkComponent = ComponentType<{ label: string; target: string }>;

export type ReportViewStatus = 'loading' | 'error' | 'unavailable' | 'no-story' | 'no-entry' | 'ready';

/** Which treatment the nothing-to-show states take. "full" is the manager
 *  panel, which gets Storybook's centered `EmptyTabContent`. "compact" is the
 *  docs block, which keeps an inline message a full-height state would dwarf. */
export type ReportViewVariant = 'full' | 'compact';

export type ReportViewProps = {
  status: ReportViewStatus;
  report?: ComponentReport;
  debuggerUrl: string;
  variant?: ReportViewVariant;
  LinkComponent?: LinkComponent;
  /** Render the "manifest debugger" footer link. Defaults to `true`; a
   *  consumer hides it everywhere via `debuggerLink: false`. */
  showDebuggerLink?: boolean;
  /** The real reason the manifest didn't load (e.g. from the server's 404 body),
   *  shown in the `unavailable` state instead of the generic addon-mcp hint. */
  unavailableReason?: string;
};

const Section = styled.section(({ theme }) => ({
  // no rule between sections: the panel and the block each already draw an edge
  // around the report, and the headings carry the division on their own
  padding: '14px 16px',
  fontSize: theme.typography.size.s2,
  background: theme.background.content,
  // a section carrying its own background has to carry the text color that goes
  // on it. Without this the headings and the props count set no color of their
  // own, inherited nothing, and fell back to the browser's black, which reads
  // on a white Docs page and disappears on a dark one
  color: theme.color.defaultText,
}));

const Heading = styled.div(({ theme }) => ({
  fontWeight: theme.typography.weight.bold,
  marginBottom: 6,
}));

// Error text takes the theme's semantic foreground scale, which is what
// Storybook's own Badge uses for these statuses. The text-tone colors next to it
// in the palette read as the same thing but hold one value for both themes, so
// they met AA on the white panel and left a struck manifest id at 1.64:1 on a
// dark Docs page.
const Negative = styled.span(({ theme }) => ({ color: theme.fgColor.negative }));

// An empty field, not a problem being reported: the finding below says it is a
// warning and what to do, so this only has to say the field is empty.
const Absent = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontStyle: 'italic',
}));

const Prose = styled.div(({ theme }) => ({
  color: theme.color.defaultText,
  lineHeight: 1.5,
  '& p': { margin: '0 0 8px' },
  '& p:last-child': { margin: 0 },
  '& code': {
    fontFamily: theme.typography.fonts.mono,
    fontSize: '0.92em',
    background: theme.background.hoverable,
    padding: '0 4px',
    borderRadius: 3,
  },
}));

// A dangling `?path=` redirect: struck through in the error color and NOT a
// link (so it can't navigate to the missing target). The `docs-link-dangling`
// finding names it; this marks it where you read it.
const DanglingLink = styled.span(({ theme }) => ({
  color: theme.fgColor.negative,
  whiteSpace: 'nowrap',
  '& s': { textDecorationColor: theme.fgColor.negative },
}));

/**
 * A manifest id that resolves to nothing, struck through in the same negative
 * as the dead links the description strikes, so the finding and the prose it
 * is about agree about what is broken.
 */
const DanglingId = styled.code(({ theme }) => ({
  // doubled, because the Docs page styles bare `code` and would otherwise win
  // the color and leave a struck id looking like any other id
  '&&': {
    fontFamily: theme.typography.fonts.mono,
    fontSize: '0.92em',
    color: theme.fgColor.negative,
    // the tint Storybook pairs with this foreground, which is transparent on a
    // dark theme. Left on the Docs page's own `code` background the struck id
    // sat at 3.17:1, because that background is lighter than the section behind
    background: theme.bgColor.negative,
    textDecoration: 'line-through',
    textDecorationColor: theme.fgColor.negative,
  },
}));

const MissingMark = styled.span(({ theme }) => ({
  color: theme.fgColor.negative,
  marginLeft: 3,
  cursor: 'help',
}));

/**
 * The mark beside anything struck through. A strikethrough and a color say
 * nothing to a screen reader, so this carries the reason, and both places that
 * strike something use this one rather than repeating the glyph.
 */
function DanglingMark() {
  return (
    <MissingMark role="img" aria-label="not in the manifest" title="not in the manifest">
      &#9888;
    </MissingMark>
  );
}

/** Sets each id the finding names as a struck-through id inside its message. */
function markDanglingIds(message: string, targets?: string[]): ReactNode {
  if (!targets?.length) return message;
  // longest first: regex alternation takes the leftmost match, so an id that is
  // a prefix of another would otherwise match inside it and truncate it
  const escaped = [...targets].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return message.split(new RegExp(`(${escaped.join('|')})`, 'g')).map((part, index) =>
    targets.includes(part) ? (
      <Fragment key={index}>
        <DanglingId>{part}</DanglingId>
        <DanglingMark />
      </Fragment>
    ) : (
      part
    ),
  );
}

const PropList = styled.ul({
  margin: '6px 0 0',
  paddingLeft: 18,
});

const Footer = styled.div(({ theme }) => ({
  padding: '10px 16px',
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  '& a': { color: theme.color.secondary },
}));

// Each severity maps to a Storybook Badge status, so a finding reads as a
// colored `error`/`warning`/`info` pill next to its rule name.
const SEVERITY_STATUS: Record<Severity, 'negative' | 'warning' | 'neutral'> = {
  error: 'negative',
  warning: 'warning',
  info: 'neutral',
};
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const FindingBody = styled.div(({ theme }) => ({
  color: theme.color.defaultText,
  fontSize: 'inherit',
  lineHeight: 1.4,
}));
// quieter than the message it answers, so a row reads what happened first
const FindingHint = styled.div(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 'inherit',
  lineHeight: 1.4,
}));
const RuleChip = styled.code(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: '0.92em',
  color: theme.textMutedColor,
  // a rule name is an identifier: it wraps as one or not at all, never broken
  // across two lines at a hyphen
  whiteSpace: 'nowrap',
}));
const PropName = styled.code(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: '0.92em',
  color: theme.color.defaultText,
}));

// A tick or a cross per prop, in the same foregrounds the findings use. Each
// carries its own label, because a glyph and a color say nothing on their own.
const DocumentedIcon = styled(CheckIcon)(({ theme }) => ({
  display: 'block',
  color: theme.fgColor.positive,
}));
const UndocumentedIcon = styled(CrossIcon)(({ theme }) => ({
  display: 'block',
  color: theme.fgColor.negative,
}));

/** The Controls panel marks a required prop with an asterisk after its name.
 *  The Required column says the same thing in a word, so this is hidden from a
 *  screen reader rather than announced twice. */
const RequiredMark = styled.span(({ theme }) => ({
  color: theme.fgColor.negative,
  marginLeft: 2,
}));

// The undocumented props take the treatment the Controls panel gives its own
// prop table, two tabs from this one: no cell borders and no striping, a muted
// heading, and a rule between rows. Storybook's `ArgsTable` is bound to args,
// so this is its look rather than the component itself.
// A rule name never breaks, so a narrow panel cannot squeeze these columns past
// their content. The table scrolls inside this rather than spilling out of the
// section, which clips it: the page itself never scrolls sideways.
const TableScroll = styled.div({ overflowX: 'auto' });

const ReportTable = styled.table(({ theme }) => ({
  // doubled throughout, because the Docs page styles every table it renders and
  // would otherwise box each cell and stripe the rows
  '&&': {
    width: '100%',
    margin: '8px 0 0',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  '&& th, && td': {
    textAlign: 'left',
    padding: '10px 15px 10px 0',
    border: 'none',
    background: 'none',
    verticalAlign: 'middle',
  },
  // last-child, not last-of-type: a row whose first cell is a th has exactly one
  // of them, so last-of-type strips the gap between the row heading and the
  // column beside it
  '&& tr > :last-child': { paddingRight: 0 },
  // the docs stylesheet stripes every other row and rules the top of each one,
  // and the panel does neither, so without this the same table reads two ways
  // on the two surfaces. The rule between rows is the td's, set below
  '&& tr': { background: 'none', borderTop: 'none' },
  '&& thead th': {
    color: theme.textMutedColor,
    fontWeight: theme.typography.weight.bold,
  },
  // a row heading is a cell that names its row, not a column heading, so it
  // takes the body treatment
  '&& tbody th, && tbody td': {
    color: theme.color.defaultText,
    fontWeight: theme.typography.weight.regular,
    borderTop: `1px solid ${theme.appBorderColor}`,
  },
}));
const Note = styled.div(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  marginBottom: 8,
}));

// A non-report state (loading / error / unavailable / no story / no entry).
// Left-aligned and padded like the panel's other content, rather than a
// centered placeholder, so a real message reads as intentional panel copy.
const StatusMessage = styled.div(({ theme }) => ({
  padding: '12px 16px',
  fontSize: theme.typography.size.s2,
  lineHeight: 1.5,
  color: theme.textMutedColor,
}));

const StatusHeading = styled.div(({ theme }) => ({
  fontWeight: theme.typography.weight.bold,
  color: theme.color.defaultText,
  marginBottom: 4,
}));

/**
 * Nothing-to-show states. The panel uses Storybook's own `EmptyTabContent`, the
 * treatment its Interactions and a11y panels use, so an empty Oversight tab
 * reads like every other empty tab. The docs block keeps the inline message: a
 * full-height centered empty state would dwarf the page it sits under.
 */
function EmptyState({
  variant,
  title,
  description,
}: {
  variant: ReportViewVariant;
  title: string;
  description?: ReactNode;
}) {
  if (variant === 'full') {
    return <EmptyTabContent title={title} description={description} />;
  }
  return (
    <StatusMessage>
      {description === undefined ? (
        title
      ) : (
        <>
          <StatusHeading>{title}</StatusHeading>
          {description}
        </>
      )}
    </StatusMessage>
  );
}

/** A severity-badged list of findings, errors first. Shared by the
 *  per-component "Findings" section and the manifest-level "Manifest" section. */
function FindingsList({ findings }: { findings: Finding[] }) {
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <TableScroll>
      <ReportTable>
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Rule</th>
            <th scope="col">Message</th>
            <th scope="col">Hint</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((finding, index) => (
            <tr key={`${finding.rule}-${index}`}>
              <td>
                <Badge compact status={SEVERITY_STATUS[finding.severity]}>
                  {finding.severity}
                </Badge>
              </td>
              {/* the rule names its row: without this the message and the hint
                  announce their column and their text and never say which rule */}
              <th scope="row">
                <RuleChip>{finding.rule}</RuleChip>
              </th>
              <td>
                <FindingBody>{markDanglingIds(finding.message, finding.targets)}</FindingBody>
              </td>
              <td>{finding.hint ? <FindingHint>{finding.hint}</FindingHint> : null}</td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
    </TableScroll>
  );
}

/** This component's coverage as named lint rules, or a clean-state note when
 *  nothing fired. */
function FindingsSection({ findings }: { findings: Finding[] }) {
  return (
    <Section>
      {findings.length === 0 ? (
        <span>
          <Badge compact status="positive">
            no findings
          </Badge>{' '}
          {/* decorative: the badge beside it already says no findings */}
          <span aria-hidden="true">&#128079;</span>
        </span>
      ) : (
        <FindingsList findings={findings} />
      )}
    </Section>
  );
}

/** Manifest-level findings (e.g. extractor-drift) are a property of the whole
 *  manifest, not one component, so they get their own section and stay out of
 *  the per-component tab count. */
function ManifestSection({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return null;
  return (
    <Section>
      <Heading>Manifest</Heading>
      <Note>Affects every component, not just this one.</Note>
      <FindingsList findings={findings} />
    </Section>
  );
}

/** Renders the small inline-markdown subset descriptions use, with links routed
 *  through the injected LinkComponent (plain text if none). */
function Markdown({
  text,
  LinkComponent,
  danglingTargets,
}: {
  text: string;
  LinkComponent?: LinkComponent;
  danglingTargets?: Set<string>;
}) {
  return (
    <Prose>
      {splitParagraphs(text).map((paragraph, pIndex) => (
        <p key={pIndex}>
          {parseInline(paragraph).map((segment, index) => {
            switch (segment.type) {
              case 'bold':
                return <strong key={index}>{segment.text}</strong>;
              case 'italic':
                return <em key={index}>{segment.text}</em>;
              case 'code':
                return <code key={index}>{segment.text}</code>;
              case 'link': {
                const targetId = storybookPathId(segment.target);
                if (targetId && danglingTargets?.has(targetId)) {
                  return (
                    <DanglingLink key={index} title={`Broken link: ${segment.target} is not in the manifest`}>
                      <s>{segment.label}</s> <DanglingMark />
                    </DanglingLink>
                  );
                }
                return LinkComponent ? (
                  <LinkComponent key={index} label={segment.label} target={segment.target} />
                ) : (
                  <Fragment key={index}>{segment.label}</Fragment>
                );
              }
              default:
                return <Fragment key={index}>{segment.text}</Fragment>;
            }
          })}
        </p>
      ))}
    </Prose>
  );
}

function StoryFailuresSection({ storyFailures }: { storyFailures: ComponentReport['storyFailures'] }) {
  return (
    <Section>
      <Heading>Stories</Heading>
      <PropList>
        {storyFailures.map((failure) => {
          const errorLine = summarizeError(failure.errorName, failure.error);
          return (
            <li key={failure.storyId || failure.storyName}>
              <code>{failure.storyName}</code>{' '}
              <Negative>
                failed extraction
                {errorLine ? `: ${errorLine}` : '.'}
              </Negative>
            </li>
          );
        })}
      </PropList>
    </Section>
  );
}

function DescriptionSection({
  description,
  LinkComponent,
  danglingTargets,
}: {
  description: string | null;
  LinkComponent?: LinkComponent;
  danglingTargets?: Set<string>;
}) {
  return (
    <Section>
      <Heading>Description</Heading>
      {description === null ? (
        <Absent>None</Absent>
      ) : (
        <Markdown text={description} LinkComponent={LinkComponent} danglingTargets={danglingTargets} />
      )}
    </Section>
  );
}

function DebuggerFooter({ debuggerUrl, componentId }: { debuggerUrl: string; componentId: string }) {
  // Deep-link to this component's section in the manifest debugger. Storybook's
  // debugger currently anchors components by array index (`c-<N>-<id>-…`), so
  // `#<componentId>` is a harmless no-op (the browser just opens the debugger at
  // the top) until a stable `id="<componentId>"` anchor lands upstream
  // (storybookjs/storybook → render-components-manifest.ts). Then it just works.
  const href = componentId ? `${debuggerUrl}#${componentId}` : debuggerUrl;
  return (
    <Footer>
      <a href={href} target="_blank" rel="noreferrer">
        manifest debugger
      </a>
    </Footer>
  );
}

/**
 * Presentational only: a resolved report plus a variant. No manager-api
 * imports, so it runs in both the addons panel and the Docs block.
 */
export function ReportView({
  status,
  report,
  debuggerUrl,
  variant = 'full',
  LinkComponent,
  showDebuggerLink = true,
  unavailableReason,
}: ReportViewProps) {
  if (status === 'loading') {
    return <EmptyState variant={variant} title="Loading the components manifest…" />;
  }
  if (status === 'error') {
    return (
      <EmptyState
        variant={variant}
        title="Manifest could not be parsed"
        description="The components manifest loaded but its format could not be parsed. It may be unsupported or malformed. See the browser console for details."
      />
    );
  }
  if (status === 'unavailable') {
    // Prefer the real reason (e.g. the server's 404 body naming
    // experimentalDocgenServer). Only guess "enable @storybook/addon-mcp" when
    // the server gave no explanation, so we never assert a cause we haven't verified.
    return (
      <EmptyState
        variant={variant}
        title="Components manifest unavailable"
        description={
          unavailableReason ??
          '/manifests/components.json did not load. Enable the manifest feature (e.g. @storybook/addon-mcp).'
        }
      />
    );
  }
  if (status === 'no-story') {
    return <EmptyState variant={variant} title="Select a story to see its coverage." />;
  }
  if (status === 'no-entry' || !report) {
    return <EmptyState variant={variant} title="No manifest entry for this component." />;
  }

  const { component, failure, storyFailures, findings, manifestFindings, propShape } = report;
  const componentId = component?.id ?? failure?.id ?? '';
  const storyErrorsShown = findings.some((d) => d.rule === 'story-extraction-error') && storyFailures.length > 0;

  if (failure) {
    const failureLine = summarizeError(failure.errorName, failure.error);
    return (
      <>
        <ManifestSection findings={manifestFindings} />
        <FindingsSection findings={findings} />
        <Section>
          <Heading>Extraction</Heading>
          <Negative>
            Docgen extraction failed
            {failureLine ? `: ${failureLine}` : '.'}
          </Negative>
        </Section>
        {storyErrorsShown && <StoryFailuresSection storyFailures={storyFailures} />}
        {showDebuggerLink && <DebuggerFooter debuggerUrl={debuggerUrl} componentId={componentId} />}
      </>
    );
  }
  if (!component) return null;

  const propNames = Object.keys(component.props);
  const danglingTargets = new Set(
    findings.filter((d) => d.rule === 'docs-link-dangling').flatMap((d) => d.targets ?? []),
  );

  return (
    <>
      <ManifestSection findings={manifestFindings} />
      <DescriptionSection
        description={component.description}
        LinkComponent={LinkComponent}
        danglingTargets={danglingTargets}
      />
      <FindingsSection findings={findings} />
      <Section>
        {propShape === 'unrecognized' ? (
          <>
            {/* the table names this section through its first column, so the
                heading is only here for the cases that have no table */}
            <Heading>Props</Heading>
            {/* The rules do not run in this case. A coverage figure read from
                the same fields would contradict the finding that says so. */}
            <span>
              The prop rules did not run: this manifest records props in a shape Oversight does not recognize.
            </span>
          </>
        ) : propNames.length === 0 ? (
          <>
            <Heading>Props</Heading>
            <span>No props extracted.</span>
          </>
        ) : (
          <TableScroll>
            <ReportTable>
              <thead>
                <tr>
                  <th scope="col">Prop</th>
                  <th scope="col">Required</th>
                  <th scope="col">Documented</th>
                </tr>
              </thead>
              <tbody>
                {propNames.map((name) => {
                  const { required, description } = component.props[name];
                  return (
                    <tr key={name}>
                      <th scope="row">
                        <PropName>{name}</PropName>
                        {required && <RequiredMark aria-hidden="true">*</RequiredMark>}
                      </th>
                      <td>{required ? 'Yes' : 'No'}</td>
                      {/* the mark says the whole thing, leading with the prop:
                          a bare "documented" only echoed the column heading
                          announced right before it */}
                      <td>
                        {description === null ? (
                          <UndocumentedIcon role="img" aria-label={`${name} is undocumented`} />
                        ) : (
                          <DocumentedIcon role="img" aria-label={`${name} is documented`} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ReportTable>
          </TableScroll>
        )}
      </Section>
      {storyErrorsShown && <StoryFailuresSection storyFailures={storyFailures} />}
      {showDebuggerLink && <DebuggerFooter debuggerUrl={debuggerUrl} componentId={componentId} />}
    </>
  );
}
