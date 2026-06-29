import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon, Toggle } from '@/components/atoms';
import { Group, GroupFooter, GroupLabel, PushedNav, SettingsRow } from '@/components/settings';
import { Screen } from '@/components/ui';
import { api } from '@/lib/api/client';
import { getAuthToken } from '@/lib/api/client';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

type FormatId = 'CSV' | 'PDF' | 'JSONL';

const SCOPES = ['crm', 'email', 'posts', 'brain', 'tickets', 'kanban', 'media', 'store'];

/**
 * Audit export builder (approvals mockup screen 05). Date range, include
 * toggles, scope chips (multi-select), format segmented control, signed-PDF
 * preview, and a primary "Generate export" CTA that simulates processing and
 * surfaces an Alert with the resulting filename.
 */
export default function AuditExportScreen() {
  const router = useRouter();

  const [approved, setApproved] = useState(true);
  const [declined, setDeclined] = useState(true);
  const [auto, setAuto] = useState(true);
  const [args, setArgs] = useState(true);
  const [outcomes, setOutcomes] = useState(true);
  const [signing, setSigning] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(SCOPES));
  const [format, setFormat] = useState<FormatId>('PDF');
  const [generating, setGenerating] = useState(false);

  const toggleScope = (s: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const generate = async () => {
    // POST /api/portal/audit/export returns the file body inline with a
    // Content-Disposition: attachment header. On web we can wrap it in a
    // Blob and trigger a download via a synthetic <a>. On native this would
    // hand off to expo-file-system + Sharing.shareAsync — not wired here
    // yet, so we fall through to the same Alert for parity.
    setGenerating(true);
    try {
      const body = {
        include: { approved, declined, auto, args, outcomes },
        scopes: Array.from(selectedScopes),
        format,
        sign: signing,
      };
      const token = getAuthToken();
      const res = await fetch(`${api.baseUrl}/api/portal/audit/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: format === 'JSONL' ? 'application/json' : 'text/csv',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const errBody = (await res.json()) as { message?: string };
          if (errBody?.message) message = errBody.message;
        } catch {
          /* not JSON */
        }
        throw new Error(message);
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename =
        filenameMatch?.[1] ?? `audit-export.${format.toLowerCase()}`;
      const rowCount = res.headers.get('x-audit-row-count');
      const sha = res.headers.get('x-audit-sha256');

      if (Platform.OS === 'web') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const blob = await res.blob();
        const url = w.URL.createObjectURL(blob);
        const a = w.document.createElement('a');
        a.href = url;
        a.download = filename;
        w.document.body.appendChild(a);
        a.click();
        a.remove();
        w.URL.revokeObjectURL(url);
        Alert.alert(
          'Export downloaded',
          `${filename}\n${rowCount ?? '0'} rows${
            sha ? `\nsha256: ${sha.slice(0, 16)}…` : ''
          }`,
          [{ text: 'OK' }],
        );
      } else {
        // Native share path — not implemented in this pass. Show details.
        Alert.alert(
          'Export ready',
          `${filename}\n${rowCount ?? '0'} rows${
            sha ? `\nsha256: ${sha.slice(0, 16)}…` : ''
          }\n\nNative download / share-sheet wiring is a follow-up.`,
          [{ text: 'OK' }],
        );
      }
    } catch (err) {
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : 'Unknown error',
        [{ text: 'OK' }],
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Screen>
      <PushedNav title="Audit export" backLabel="Approvals" onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.4,
            }}
          >
            Audit export
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: T.textSecondary,
              marginTop: 4,
              lineHeight: 18,
            }}
          >
            Generate a signed CSV or PDF of approval activity — share with auditors, legal, or your
            security review.
          </Text>
        </View>

        <GroupLabel>Date range</GroupLabel>
        <Group>
          <SettingsRow
            icon="event"
            iconBg={T.iosBlue}
            iconFill={1}
            title="From"
            value="Apr 1, 2026"
          />
          <SettingsRow
            icon="event"
            iconBg={T.iosBlue}
            iconFill={1}
            title="To"
            value="May 22, 2026"
            last
          />
        </Group>

        <GroupLabel>Include</GroupLabel>
        <Group>
          <SettingsRow
            icon="check_circle"
            iconBg={T.success}
            iconFill={1}
            title="Approved actions"
            accessory={<Toggle value={approved} onChange={setApproved} />}
          />
          <SettingsRow
            icon="cancel"
            iconBg={T.danger}
            iconFill={1}
            title="Declined actions"
            accessory={<Toggle value={declined} onChange={setDeclined} />}
          />
          <SettingsRow
            icon="bolt"
            iconBg={T.warning}
            iconFill={1}
            title="Auto-approved actions"
            accessory={<Toggle value={auto} onChange={setAuto} />}
          />
          <SettingsRow
            icon="data_object"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Tool arguments"
            accessory={<Toggle value={args} onChange={setArgs} />}
          />
          <SettingsRow
            icon="link"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Outcomes & links"
            accessory={<Toggle value={outcomes} onChange={setOutcomes} />}
            last
          />
        </Group>
        <GroupFooter>
          Tool arguments may contain sensitive values (emails, names, dollar amounts).
        </GroupFooter>

        <GroupLabel>Filter by scope</GroupLabel>
        <View
          style={{
            marginHorizontal: 16,
            padding: 12,
            backgroundColor: T.bgCard,
            borderRadius: 14,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {SCOPES.map((s) => {
            const sel = selectedScopes.has(s);
            return (
              <Pressable
                key={s}
                onPress={() => toggleScope(s)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: sel ? T.aiBorder : T.border,
                  backgroundColor: sel ? T.aiSoft : T.bgSubtle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {sel ? <MIcon name="check" size={12} color={T.ai} /> : null}
                <Text
                  style={{
                    fontFamily: 'Menlo',
                    fontSize: 11.5,
                    color: sel ? T.aiDark : T.textSecondary,
                    fontWeight: '600',
                    letterSpacing: -0.05,
                  }}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <GroupLabel>Format</GroupLabel>
        <View
          style={{
            marginHorizontal: 16,
            padding: 4,
            backgroundColor: T.bgCard,
            borderRadius: 14,
            flexDirection: 'row',
            gap: 4,
          }}
        >
          {(['CSV', 'PDF', 'JSONL'] as FormatId[]).map((f) => {
            const sel = format === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFormat(f)}
                style={{ flex: 1, borderRadius: 11, overflow: 'hidden' }}
              >
                {sel ? (
                  <LinearGradient
                    {...linearGradientProps(Gradients.ai)}
                    style={{ paddingVertical: 10, alignItems: 'center' }}
                  >
                    <Text
                      style={{
                        color: 'white',
                        fontSize: 13.5,
                        fontWeight: '700',
                        letterSpacing: -0.1,
                        fontFamily: 'Menlo',
                      }}
                    >
                      {f}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text
                      style={{
                        color: T.textSecondary,
                        fontSize: 13.5,
                        fontWeight: '700',
                        letterSpacing: -0.1,
                        fontFamily: 'Menlo',
                      }}
                    >
                      {f}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <GroupLabel>Signing</GroupLabel>
        <Group>
          <SettingsRow
            icon="verified_user"
            iconBg={T.success}
            iconFill={1}
            title="Cryptographically sign export"
            accessory={<Toggle value={signing} onChange={setSigning} />}
            last
          />
        </Group>
        <GroupFooter>
          SHA-256 + workspace key. Auditors can verify the file hasn't been edited.
        </GroupFooter>

        {/* Preview */}
        <GroupLabel>Preview</GroupLabel>
        <View style={{ marginHorizontal: 16 }}>
          <View
            style={{
              backgroundColor: T.bgCard,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: T.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 46,
                  borderRadius: 5,
                  backgroundColor: '#FEE2E2',
                  borderWidth: 1,
                  borderColor: T.danger + '33',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{ color: T.danger, fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}
                >
                  {format}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Menlo',
                    fontSize: 11.5,
                    color: T.textPrimary,
                    fontWeight: '600',
                    letterSpacing: -0.3,
                  }}
                >
                  audit-2026-04-01_to_2026-05-22.{format.toLowerCase()}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 2,
                  }}
                >
                  <MIcon name="lock" size={11} color={T.success} fill={1} />
                  <Text style={{ fontSize: 11, color: T.textTertiary }}>
                    {signing ? 'Signed' : 'Unsigned'} · ~412 KB
                  </Text>
                </View>
              </View>
            </View>

            {/* Seal + stats */}
            <View
              style={{
                backgroundColor: T.bgSubtle,
                borderRadius: 10,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="verified" size={22} color="white" fill={1} />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: T.textTertiary,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  SimplerDevelopment seal
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    marginTop: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    { v: '247', l: 'approved' },
                    { v: '12', l: 'declined' },
                    { v: '38', l: 'auto' },
                    { v: '8/8', l: 'scopes' },
                  ].map((s) => (
                    <View key={s.l}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: T.textPrimary,
                          letterSpacing: -0.2,
                        }}
                      >
                        {s.v}
                      </Text>
                      <Text
                        style={{
                          fontSize: 9,
                          color: T.textTertiary,
                          fontWeight: '600',
                          letterSpacing: 0.3,
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.l}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 16,
          backgroundColor: 'rgba(255,255,255,0.98)',
          borderTopWidth: 0.5,
          borderTopColor: T.rowDivider,
        }}
      >
        <Pressable
          onPress={generate}
          disabled={generating}
          style={({ pressed }) => ({
            borderRadius: 14,
            overflow: 'hidden',
            opacity: pressed || generating ? 0.85 : 1,
            shadowColor: T.ai,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
          })}
        >
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {generating ? (
              <ActivityIndicator color="white" />
            ) : (
              <MIcon name="download" size={17} color="white" fill={1} />
            )}
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700', letterSpacing: -0.1 }}>
              {generating ? 'Generating…' : 'Generate export'}
            </Text>
          </LinearGradient>
        </Pressable>
        <Text
          style={{
            fontSize: 10.5,
            color: T.textTertiary,
            marginTop: 6,
            textAlign: 'center',
            letterSpacing: 0.2,
          }}
        >
          Expected file size ~412 KB · ready in &lt;3 seconds
        </Text>
      </View>
    </Screen>
  );
}
