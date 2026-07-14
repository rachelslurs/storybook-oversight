import { Fragment } from 'react';
import type { ComponentType } from 'react';
import { Badge, Placeholder } from 'storybook/internal/components';
import { styled } from 'storybook/theming';
import type { ComponentReport, Diagnostic, DiagnosticSeverity } from '../core';
import { parseInline, splitParagraphs, storybookPathId } from './markdown';

/** A context-appropriate link to a `?path=/docs|story/<id>` target. The manager
 *  navigates via `api.selectStory`. Only needed by the "full" variant. */
export type LinkComponent = ComponentType<{ label: string; target: string }>;

export type ReportViewStatus = 'loading' | 'unavailable' | 'no-story' | 'no-entry' | 'ready';

/** "full" renders the description as markdown (the manager panel — no other
 *  description nearby). "compact" shows a documented/missing verdict (the docs
 *  block — autodocs renders the prose right beside it). */
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
};

const Section = styled.section(({ theme }) => ({
  padding: '12px 16px',
  borderBottom: `1px solid ${theme.appBorderColor}`,
  fontSize: theme.typography.size.s2,
}));

const Heading = styled.div(({ theme }) => ({
  fontWeight: theme.typography.weight.bold,
  marginBottom: 6,
}));

const Positive = styled.span(({ theme }) => ({ color: theme.color.positive }));
const Warning = styled.span(({ theme }) => ({ color: theme.color.warning }));
const Negative = styled.span(({ theme }) => ({ color: theme.color.negative }));

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
  color: theme.color.negative,
  whiteSpace: 'nowrap',
  '& s': { textDecorationColor: theme.color.negative },
}));

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
const SEVERITY_STATUS: Record<DiagnosticSeverity, 'negative' | 'warning' | 'neutral'> = {
  error: 'negative',
  warning: 'warning',
  info: 'neutral',
};
const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };

const FindingList = styled.ul({ listStyle: 'none', margin: 0, padding: 0 });
const FindingItem = styled.li({
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  margin: '0 0 8px',
  '&:last-child': { margin: 0 },
});
const FindingBody = styled.div(({ theme }) => ({ color: theme.color.defaultText, lineHeight: 1.4 }));
const RuleName = styled.code(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: '0.92em',
  color: theme.textMutedColor,
}));
const Note = styled.div(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  marginBottom: 8,
}));

/** A severity-badged list of diagnostics, errors first. Shared by the
 *  per-component "Findings" section and the manifest-level "Manifest" section. */
function FindingsList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const sorted = [...diagnostics].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <FindingList>
      {sorted.map((diagnostic, index) => (
        <FindingItem key={`${diagnostic.rule}-${index}`}>
          <Badge compact status={SEVERITY_STATUS[diagnostic.severity]}>
            {diagnostic.severity}
          </Badge>
          <FindingBody>
            <RuleName>{diagnostic.rule}</RuleName> {diagnostic.message}
          </FindingBody>
        </FindingItem>
      ))}
    </FindingList>
  );
}

/** This component's coverage as named lint rules — or a clean-state note when
 *  nothing fired. */
function FindingsSection({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <Section>
      <Heading>Findings</Heading>
      {diagnostics.length === 0 ? (
        <Positive>✓ No findings — this component&apos;s docs reach the agent intact.</Positive>
      ) : (
        <FindingsList diagnostics={diagnostics} />
      )}
    </Section>
  );
}

/** Manifest-level findings (e.g. extractor-drift) are a property of the whole
 *  manifest, not one component, so they get their own section and stay out of
 *  the per-component tab count. */
function ManifestSection({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <Section>
      <Heading>Manifest</Heading>
      <Note>Affects every component, not just this one.</Note>
      <FindingsList diagnostics={diagnostics} />
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
                      <s>{segment.label}</s> ⚠
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
        {storyFailures.map((failure) => (
          <li key={failure.storyId || failure.storyName}>
            <code>{failure.storyName}</code>{' '}
            <Negative>
              {/* Manifest errors can embed whole source files — first line only. */}
              failed extraction
              {failure.error ? `: ${failure.error.split('\n')[0]}` : '.'}
            </Negative>
          </li>
        ))}
      </PropList>
    </Section>
  );
}

function DescriptionSection({
  description,
  sourceFile,
  name,
  variant,
  LinkComponent,
  danglingTargets,
}: {
  description: string | null;
  sourceFile: string | null;
  name: string;
  variant: ReportViewVariant;
  LinkComponent?: LinkComponent;
  danglingTargets?: Set<string>;
}) {
  return (
    <Section>
      <Heading>Description</Heading>
      {description === null ? (
        <Warning>
          Missing. The MCP and Docs tab describe {name} as nothing
          {sourceFile ? ` — add JSDoc in ${sourceFile}` : ''}.
        </Warning>
      ) : variant === 'compact' ? (
        <Positive>✓ Documented — the MCP and Docs page show the JSDoc for this component.</Positive>
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
  // (storybookjs/storybook → render-components-manifest.ts) — then it just works.
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
 * Presentational only — a resolved report plus a variant. No manager-api
 * imports, so it runs in both the manager panel and a docs-page block.
 */
export function ReportView({
  status,
  report,
  debuggerUrl,
  variant = 'full',
  LinkComponent,
  showDebuggerLink = true,
}: ReportViewProps) {
  if (status === 'loading') {
    return <Placeholder>Loading the components manifest…</Placeholder>;
  }
  if (status === 'unavailable') {
    return (
      <Placeholder>
        Components manifest unavailable — /manifests/components.json did not load. Enable the manifest feature (e.g.
        @storybook/addon-mcp).
      </Placeholder>
    );
  }
  if (status === 'no-story') {
    return <Placeholder>Select a story to see its coverage.</Placeholder>;
  }
  if (status === 'no-entry' || !report) {
    return <Placeholder>No manifest entry for this component.</Placeholder>;
  }

  const { component, failure, storyFailures, diagnostics, manifestDiagnostics } = report;
  const componentId = component?.id ?? failure?.id ?? '';
  const storyErrorsShown = diagnostics.some((d) => d.rule === 'story-extraction-error') && storyFailures.length > 0;

  if (failure) {
    return (
      <>
        <ManifestSection diagnostics={manifestDiagnostics} />
        <FindingsSection diagnostics={diagnostics} />
        <Section>
          <Heading>Extraction</Heading>
          <Negative>
            {/* Manifest errors can embed whole source files — first line only. */}
            Docgen extraction failed
            {failure.error ? `: ${failure.error.split('\n')[0]}` : '.'}
          </Negative>
        </Section>
        {storyErrorsShown && <StoryFailuresSection storyFailures={storyFailures} />}
        {showDebuggerLink && <DebuggerFooter debuggerUrl={debuggerUrl} componentId={componentId} />}
      </>
    );
  }
  if (!component) return null;

  const propNames = Object.keys(component.props);
  const undocumented = propNames.filter((name) => component.props[name].description === null);
  const danglingTargets = new Set(
    diagnostics.filter((d) => d.rule === 'docs-link-dangling').flatMap((d) => d.targets ?? []),
  );

  return (
    <>
      <ManifestSection diagnostics={manifestDiagnostics} />
      <FindingsSection diagnostics={diagnostics} />
      <DescriptionSection
        description={component.description}
        sourceFile={component.sourceFile}
        name={component.name}
        variant={variant}
        LinkComponent={LinkComponent}
        danglingTargets={danglingTargets}
      />
      <Section>
        <Heading>Props</Heading>
        {propNames.length === 0 ? (
          <span>No props extracted.</span>
        ) : (
          <>
            <span>
              {propNames.length - undocumented.length}/{propNames.length} props documented
            </span>
            {undocumented.length > 0 && (
              <PropList>
                {undocumented.map((name) => (
                  <li key={name}>
                    <code>{name}</code>{' '}
                    {component.props[name].required ? (
                      <Negative>(required, undocumented)</Negative>
                    ) : (
                      <Warning>(undocumented)</Warning>
                    )}
                  </li>
                ))}
              </PropList>
            )}
          </>
        )}
      </Section>
      {storyErrorsShown && <StoryFailuresSection storyFailures={storyFailures} />}
      {showDebuggerLink && <DebuggerFooter debuggerUrl={debuggerUrl} componentId={componentId} />}
    </>
  );
}
