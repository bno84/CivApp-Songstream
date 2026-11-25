// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';

import type { InfoStore } from '../info.js';
import { formatCount } from '../media.js';
import { useOpen } from '../open.js';
import { imagePath, type Track } from '../track.js';
import { Icon } from './Icon.js';

/** The current item's generation data, as Civitai's image sidebar shows it. */
export function Details({ track, infos }: { track: Track | null; infos: InfoStore }) {
  const open = useOpen();
  if (!track) return <p className="panel-note">Nothing playing.</p>;
  const info = infos.get(track.id);
  const comments = info?.status === 'ready' ? info.stats.commentCount ?? 0 : null;

  let body;
  if (!info || info.status === 'loading') {
    body = <p className="panel-note">Loading details…</p>;
  } else if (info.status === 'missing') {
    body = <p className="panel-note">Civitai does not list details for this one.</p>;
  } else if (info.status === 'error') {
    body = <p className="panel-note">{info.message}</p>;
  } else if (!info.generation) {
    body = <p className="panel-note">Civitai lists no generation details for this one. The page on Civitai may show more.</p>;
  } else {
    const { prompt, negativePrompt, settings, resources } = info.generation;
    body = (
      <>
        {prompt && <Prompt label="Prompt" text={prompt} />}
        {negativePrompt && <Prompt label="Negative prompt" text={negativePrompt} collapsed />}
        {settings.length > 0 && (
          <dl className="settings">
            {settings.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        )}
        {resources.length > 0 && (
          <>
            <h3 className="section-label">Resources</h3>
            <ul className="resources">
              {resources.map((resource, i) => (
                // Resources carry no id of their own, and the list never reorders.
                // eslint-disable-next-line @eslint-react/no-array-index-key -- static list, see above
                <li key={i}>
                  <span className="tag">{resource.type}</span>
                  {resource.path ? (
                    <button type="button" className="link ellipsis" onClick={() => open(resource.path!)}>
                      {resource.name}
                    </button>
                  ) : (
                    <span className="ellipsis">{resource.name}</span>
                  )}
                  {resource.weight != null && <span className="weight">{resource.weight}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <div className="details">
      {body}
      <button type="button" className="comments-note" onClick={() => open(imagePath(track.id))}>
        <Icon name="comment" size={16} />
        <span>
          {comments == null ? 'Comments' : `${formatCount(comments)} comment${comments === 1 ? '' : 's'}`}.
          Apps cannot show comments yet, so this <strong>opens them on Civitai</strong>.
        </span>
        <Icon name="external" size={14} />
      </button>
    </div>
  );
}

function Prompt({ label, text, collapsed = false }: { label: string; text: string; collapsed?: boolean }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    setCopied((await copyText(text)) ? 'yes' : 'no');
    setTimeout(() => setCopied(null), 1500);
  };
  const content = (
    <div className="prompt">
      <p>{text}</p>
      <button type="button" className="copy" onClick={() => void copy()}>
        {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Select to copy' : 'Copy'}
      </button>
    </div>
  );
  if (!collapsed) return <><h3 className="section-label">{label}</h3>{content}</>;
  return (
    <details className="collapsible">
      <summary className="section-label">{label}</summary>
      {content}
    </details>
  );
}

/**
 * Copies text. The async clipboard needs a permission the host's iframe may not
 * delegate; the older selection copy works from a click in most browsers.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
