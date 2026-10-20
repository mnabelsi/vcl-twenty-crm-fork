import { useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  enqueueSnackbar,
  openCommandConfirmationModal,
  useColorScheme,
} from 'twenty-sdk/front-component';

import {
  APP_DISPLAY_NAME,
  MAIN_PAGE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

type RunCounts = Record<string, number>;

type SyncErrorEntry = {
  at: string;
  direction: 'pull' | 'push' | 'run';
  object: 'company' | 'person' | 'run';
  label: string;
  twentyId: string | null;
  zohoId: string | null;
  message: string;
};

type StatusResponse = {
  configured: boolean;
  missing: string[];
  hasClientCredentials: boolean;
  dataCenter: string;
  direction: string;
  running: boolean;
  status: {
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunOutcome: 'ok' | 'partial' | 'failed' | 'skipped' | null;
    lastRunMessage: string | null;
    lastRunCounts: RunCounts | null;
    totals: RunCounts;
    initialImportDone: boolean;
    moreWorkPending: boolean;
    backfillRunning: boolean;
    zohoOrganization: string | null;
    recentErrors: SyncErrorEntry[];
  };
};

const SCOPES =
  'ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.accounts.ALL,ZohoCRM.org.READ';

const DIRECTION_LABELS: Record<string, string> = {
  TWO_WAY: 'Two-way',
  ZOHO_TO_TWENTY: 'Zoho to Twenty only',
  TWENTY_TO_ZOHO: 'Twenty to Zoho only',
  PAUSED: 'Paused',
};

const palette = (scheme: 'light' | 'dark') =>
  scheme === 'dark'
    ? {
        text: '#ebebeb',
        muted: '#999999',
        border: '#333333',
        card: '#1b1b1b',
        input: '#222222',
        accent: '#4c8bf5',
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149',
      }
    : {
        text: '#333333',
        muted: '#818181',
        border: '#ebebeb',
        card: '#ffffff',
        input: '#fcfcfc',
        accent: '#1961ed',
        success: '#1e8a3c',
        warning: '#b76e00',
        danger: '#d4380d',
      };

const relativeTime = (iso: string | null): string => {
  if (!iso) {
    return 'never';
  }

  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);

  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min ago`;
  }
  if (seconds < 86400) {
    return `${Math.round(seconds / 3600)} h ago`;
  }

  return new Date(iso).toLocaleString();
};

const ZohoSyncPage = () => {
  const colors = palette(useColorScheme());
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grantCode, setGrantCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(
        await new RestApiClient().get<StatusResponse>('/s/zoho-sync/status'),
      );
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, data?.running ? 4000 : 20000);

    return () => clearInterval(interval);
  }, [refresh, data?.running]);

  const run = async (mode: 'incremental' | 'full-pull' | 'push-unlinked') => {
    if (mode !== 'incremental') {
      const choice = await openCommandConfirmationModal(
        mode === 'full-pull'
          ? {
              title: 'Import everything again from Zoho?',
              subtitle:
                'Every Zoho contact and account is read again and matched to Twenty. Nothing is deleted; values changed on both sides keep the latest edit.',
              confirmButtonText: 'Import again',
            }
          : {
              title: 'Send unlinked Twenty records to Zoho?',
              subtitle:
                'People and companies that have no Zoho record yet are created in Zoho (or linked to a Zoho record with the same email or account name). Records Twenty created from emails and meetings are left out.',
              confirmButtonText: 'Send to Zoho',
            },
      );

      if (choice !== 'confirm') {
        return;
      }
    }

    setBusy(mode);
    try {
      await new RestApiClient().post('/s/zoho-sync/run', { mode });
      await enqueueSnackbar({
        message: 'Sync started',
        variant: 'success',
      });
      setTimeout(refresh, 1500);
    } catch (error) {
      await enqueueSnackbar({
        message: `Could not start the sync: ${(error as Error).message}`,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy('connect');
    try {
      const result = await new RestApiClient().post<{
        connected: boolean;
        error?: string;
      }>('/s/zoho-sync/connect', { grantCode });

      if (result.connected) {
        setGrantCode('');
        setShowConnect(false);
        await enqueueSnackbar({
          message: 'Connected to Zoho. The first sync is starting.',
          variant: 'success',
        });
        setTimeout(refresh, 2500);
      } else {
        await enqueueSnackbar({
          message: result.error ?? 'Could not connect to Zoho',
          variant: 'error',
        });
      }
    } catch (error) {
      await enqueueSnackbar({
        message: (error as Error).message,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const card = {
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    background: colors.card,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  };
  const heading = {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.text,
    margin: 0,
  };
  const muted = {
    fontSize: '13px',
    color: colors.muted,
    lineHeight: 1.5,
    margin: 0,
  };
  const button = (primary: boolean, disabled: boolean) => ({
    fontSize: '13px',
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: primary
      ? `1px solid ${colors.accent}`
      : `1px solid ${colors.border}`,
    background: primary ? colors.accent : colors.card,
    color: primary ? '#ffffff' : colors.text,
  });

  if (!data) {
    return (
      <div
        style={{
          padding: '24px',
          fontFamily: 'Inter, sans-serif',
          ...muted,
        }}
      >
        {loadError
          ? `Could not load the sync status: ${loadError}`
          : 'Loading...'}
      </div>
    );
  }

  const { status } = data;
  const connected = data.configured && status.lastRunOutcome !== 'failed';
  const paused = data.direction === 'PAUSED';
  const state = data.running
    ? { text: 'Syncing', color: colors.accent }
    : !data.configured
      ? { text: 'Not connected', color: colors.warning }
      : paused
        ? { text: 'Paused', color: colors.muted }
        : status.lastRunOutcome === 'failed'
          ? { text: 'Needs attention', color: colors.danger }
          : { text: 'Connected', color: colors.success };
  const totals = status.totals ?? {};
  const counter = (label: string, value: number) => (
    <div
      key={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: '120px',
      }}
    >
      <span
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: colors.text,
        }}
      >
        {value.toLocaleString()}
      </span>
      <span style={{ fontSize: '12px', color: colors.muted }}>{label}</span>
    </div>
  );
  const anyBusy = busy !== null || data.running;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        maxWidth: '760px',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: colors.text,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '20px', fontWeight: 600 }}>
          {APP_DISPLAY_NAME}
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '10px',
            color: state.color,
            border: `1px solid ${state.color}`,
          }}
        >
          {state.text}
        </span>
      </div>
      <p style={muted}>
        Zoho Contacts and Accounts are kept in step with Twenty People and
        Companies every five minutes. Direction:{' '}
        {DIRECTION_LABELS[data.direction] ?? data.direction}. Data center:{' '}
        {data.dataCenter}
        {status.zohoOrganization
          ? `. Zoho organization: ${status.zohoOrganization}`
          : ''}
        .
      </p>

      {(!data.configured ||
        showConnect ||
        status.lastRunOutcome === 'failed') && (
        <div style={card}>
          <p style={heading}>
            {data.configured ? 'Reconnect Zoho' : 'Connect Zoho'}
          </p>
          <ol
            style={{
              ...muted,
              paddingLeft: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <li>
              In the Zoho API console (api-console.zoho.com, or the one of your
              data center) add a <strong>Self Client</strong>. Copy its client
              ID and client secret into Settings, Apps, {APP_DISPLAY_NAME},
              Variables, and pick your data center there.
            </li>
            <li>
              In the Self Client, open <strong>Generate Code</strong>, paste
              these scopes, choose 10 minutes and create the code:
              <div
                style={{
                  marginTop: '6px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: colors.text,
                  wordBreak: 'break-all',
                }}
              >
                {SCOPES}
              </div>
            </li>
            <li>
              Paste the grant code below and connect. The code works once.
            </li>
          </ol>
          {!data.hasClientCredentials && (
            <p style={{ ...muted, color: colors.warning }}>
              The client ID and client secret are not filled in yet.
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <input
              value={grantCode}
              onChange={(event) => setGrantCode(event.target.value)}
              placeholder="1000.xxxxxxxx.xxxxxxxx"
              style={{
                flex: '1 1 260px',
                fontSize: '13px',
                padding: '6px 8px',
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
                background: colors.input,
                color: colors.text,
              }}
            />
            <button
              type="button"
              disabled={grantCode.trim() === '' || busy !== null}
              onClick={connect}
              style={button(true, grantCode.trim() === '' || busy !== null)}
            >
              {busy === 'connect' ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <p style={heading}>Last run</p>
          <span style={muted}>
            {data.running
              ? `started ${relativeTime(status.lastRunStartedAt)}`
              : relativeTime(status.lastRunFinishedAt)}
          </span>
        </div>
        <p style={muted}>
          {data.running
            ? status.initialImportDone
              ? 'Syncing changes...'
              : 'Importing from Zoho. The first import can take a few runs; this page updates by itself.'
            : (status.lastRunMessage ??
              'No run yet. The first one starts within five minutes of connecting.')}
        </p>
        {status.backfillRunning && (
          <p style={muted}>
            Sending unlinked Twenty records to Zoho, a page at a time.
          </p>
        )}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            flexWrap: 'wrap',
            marginTop: '4px',
          }}
        >
          {counter(
            'matched or created in Twenty',
            (totals.peopleCreated ?? 0) +
              (totals.companiesCreated ?? 0) +
              (totals.peopleLinked ?? 0) +
              (totals.companiesLinked ?? 0),
          )}
          {counter(
            'updated in Twenty',
            (totals.peopleUpdated ?? 0) + (totals.companiesUpdated ?? 0),
          )}
          {counter(
            'created or updated in Zoho',
            (totals.zohoContactsCreated ?? 0) +
              (totals.zohoAccountsCreated ?? 0) +
              (totals.zohoContactsUpdated ?? 0) +
              (totals.zohoAccountsUpdated ?? 0),
          )}
        </div>
        <span style={{ fontSize: '12px', color: colors.muted }}>
          Totals since the app was installed.
        </span>
      </div>

      <div style={card}>
        <p style={heading}>Actions</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={!data.configured || paused || anyBusy}
            onClick={() => run('incremental')}
            style={button(true, !data.configured || paused || anyBusy)}
          >
            {busy === 'incremental' ? 'Starting...' : 'Sync now'}
          </button>
          <button
            type="button"
            disabled={
              !data.configured ||
              paused ||
              anyBusy ||
              data.direction === 'TWENTY_TO_ZOHO'
            }
            onClick={() => run('full-pull')}
            style={button(
              false,
              !data.configured ||
                paused ||
                anyBusy ||
                data.direction === 'TWENTY_TO_ZOHO',
            )}
          >
            Import everything again from Zoho
          </button>
          <button
            type="button"
            disabled={
              !data.configured ||
              paused ||
              anyBusy ||
              data.direction === 'ZOHO_TO_TWENTY'
            }
            onClick={() => run('push-unlinked')}
            style={button(
              false,
              !data.configured ||
                paused ||
                anyBusy ||
                data.direction === 'ZOHO_TO_TWENTY',
            )}
          >
            Send unlinked Twenty records to Zoho
          </button>
          {connected && !showConnect && (
            <button
              type="button"
              onClick={() => setShowConnect(true)}
              style={button(false, false)}
            >
              Reconnect Zoho
            </button>
          )}
        </div>
      </div>

      {status.recentErrors.length > 0 && (
        <div style={card}>
          <p style={heading}>Recent problems</p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {status.recentErrors.slice(0, 15).map((entry, index) => (
              <div
                key={`${entry.at}-${index}`}
                style={{
                  borderTop:
                    index === 0 ? 'none' : `1px solid ${colors.border}`,
                  paddingTop: index === 0 ? 0 : '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                  }}
                >
                  {entry.twentyId && entry.object !== 'run' ? (
                    <a
                      href={`/object/${entry.object}/${entry.twentyId}`}
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: colors.accent,
                        textDecoration: 'none',
                      }}
                    >
                      {entry.label}
                    </a>
                  ) : (
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      {entry.label}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '12px',
                      color: colors.muted,
                    }}
                  >
                    {entry.direction === 'pull'
                      ? 'Zoho to Twenty, '
                      : entry.direction === 'push'
                        ? 'Twenty to Zoho, '
                        : ''}
                    {relativeTime(entry.at)}
                  </span>
                </div>
                <p
                  style={{
                    ...muted,
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: MAIN_PAGE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'zoho-sync-page',
  description: 'Status, connection and actions of the Zoho CRM sync',
  component: ZohoSyncPage,
});
