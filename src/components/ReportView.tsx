import { Fragment } from 'react';
import type { ComponentType } from 'react';
import { Placeholder } from 'storybook/internal/components';
import { styled } from 'storybook/theming';
import type { ComponentReport } from '../core';
import { parseInline, splitParagraphs } from './markdown';

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

/** Renders the small inline-markdown subset descriptions use, with links routed
 *  through the injected LinkComponent (plain text if none). */
function Markdown({ text, LinkComponent }: { text: string; LinkComponent?: LinkComponent }) {
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
              case 'link':
                return LinkComponent ? (
                  <LinkComponent key={index} label={segment.label} target={segment.target} />
                ) : (
                  <Fragment key={index}>{segment.label}</Fragment>
                );
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
}: {
  description: string | null;
  sourceFile: string | null;
  name: string;
  variant: ReportViewVariant;
  LinkComponent?: LinkComponent;
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
        <Markdown text={description} LinkComponent={LinkComponent} />
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

  const { component, failure, storyFailures, diagnostics } = report;
  const componentId = component?.id ?? failure?.id ?? '';
  const storyErrorsShown = diagnostics.some((d) => d.rule === 'story-extraction-error') && storyFailures.length > 0;

  if (failure) {
    return (
      <>
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

  return (
    <>
      <DescriptionSection
        description={component.description}
        sourceFile={component.sourceFile}
        name={component.name}
        variant={variant}
        LinkComponent={LinkComponent}
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
