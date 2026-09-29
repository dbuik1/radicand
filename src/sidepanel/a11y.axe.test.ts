// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { createCopyControls } from './output';
import { createSourceView } from './source';
import { createStyleMenu } from './style-menu';
import { createWorkspace } from './workspace';
import { INTERFACE_PARTS } from './interface-parts';
import { setPart, showEveryPart } from './part-visibility';
import type { EditorController } from './editor';

/**
 * Automated accessibility check.
 *
 * We assemble the real side-panel markup (from index.html) and mount the real
 * Style menu, workspace (every mode built and shown in turn), source and
 * copy components, then run axe over the result.
 *
 * The live MathLive `<math-field>` is a third-party custom element that cannot
 * instantiate in a headless DOM, so it is represented here by a correctly
 * labelled stand-in with the same accessibility contract (role="math",
 * aria-labelledby). MathLive's own internal a11y is the library's concern.
 *
 * `color-contrast` is disabled because happy-dom performs no layout/painting,
 * so axe cannot compute contrast ratios. Contrast is enforced by the design
 * tokens (checked to WCAG AA) and verified in the manual pass recorded in
 * tests/a11y/AUDIT-BASELINE.md.
 */
function stubEditor(): EditorController {
  // The Style menu reads the field's selection and style state on creation.
  const element = Object.assign(document.createElement('div'), {
    getValue: () => '',
    queryStyle: () => 'none',
    selection: { ranges: [[0, 0]] },
  });
  return {
    element: element as unknown as EditorController['element'],
    getValue: () => '',
    getLatex: () => '',
    getSpokenText: () => '',
    setLatex: () => {},
    insert: () => {},
    isEmpty: () => true,
    focus: () => {},
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
}

function loadPanelBody(): string {
  // Resolved from the project root (vitest's working directory).
  const htmlPath = resolve(process.cwd(), 'src/sidepanel/index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
  // Drop the module script tag; we mount components manually below.
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('axe accessibility audit of the side panel', () => {
  let workspace: ReturnType<typeof createWorkspace>;

  beforeEach(() => {
    document.documentElement.lang = 'en-GB';
    document.body.innerHTML = loadPanelBody();

    const mount = document.getElementById('editor-mount')!;

    // Labelled stand-in for the live math field. Carries the same id the real
    // field gets in main.ts, so the skip link's target resolves here too.
    const label = document.createElement('span');
    label.id = 'editor-label';
    label.textContent = 'Equation';
    const field = document.createElement('div');
    field.id = 'equation-editor';
    field.setAttribute('role', 'math');
    field.setAttribute('aria-labelledby', 'editor-label');
    field.tabIndex = 0;
    mount.append(label, field);

    const editor = stubEditor();
    workspace = createWorkspace(editor, { onSearch: () => {} });
    mount.append(
      createStyleMenu(editor).root,
      workspace.root,
      createSourceView(editor),
      createCopyControls(editor),
    );
  });

  async function expectNoViolations(): Promise<void> {
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });

    if (results.violations.length > 0) {
      // Surface a readable summary on failure.
      const summary = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`)
        .join('\n');
      console.error('axe violations:\n' + summary);
    }

    expect(results.violations).toEqual([]);
  }

  it('reports zero violations with Symbols showing', async () => {
    await expectNoViolations();
  });

  for (const mode of ['drawing', 'library', 'settings', 'shortcuts'] as const) {
    it(`reports zero violations with ${mode} showing`, async () => {
      workspace.open(mode);
      await expectNoViolations();
    });
  }

  // The simplest state the panel offers: nothing but the field. Settings is
  // the mode showing, since that is where a user in this state works, and it
  // is the one place every piece can be brought back from.
  it('reports zero violations with every piece switched off', async () => {
    for (const spec of INTERFACE_PARTS) await setPart(spec.part, false);
    workspace.open('settings');
    await expectNoViolations();
    await showEveryPart();
  });
});
