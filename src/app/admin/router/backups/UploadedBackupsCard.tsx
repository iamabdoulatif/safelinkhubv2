"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Upload, Loader2, ScanLine, RotateCcw, Trash2, AlertTriangle, FileUp } from "lucide-react";
import {
  uploadRouterBackup,
  getOrgUploadedBackups,
  deleteUploadedBackup,
  scanUploadedBackupRestore,
  restoreUploadedBackup,
} from "@/lib/mikrotik/backup-upload-actions";
import { resetBinaryBackupRestoreConfirmation } from "@/lib/mikrotik/binary-backup-restore-guard";

type RouterRow = { id: string; name: string; status: string; model: string | null };
type Uploaded = {
  id: string;
  fileName: string;
  sizeBytes: number;
  encrypted: boolean;
  uploadedByName: string | null;
  createdAt: string;
};

type ScanPlan = {
  fileName: string;
  sizeBytes: number;
  encrypted: boolean;
  targetBoard: string;
  targetVersion: string;
  targetName: string;
};

function fmtSize(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`;
}

function toRow(b: {
  id: string;
  fileName: string;
  sizeBytes: number;
  encrypted: boolean;
  uploadedByName: string | null;
  createdAt: string | Date;
}): Uploaded {
  return {
    id: b.id,
    fileName: b.fileName,
    sizeBytes: b.sizeBytes,
    encrypted: b.encrypted,
    uploadedByName: b.uploadedByName,
    createdAt: typeof b.createdAt === "string" ? b.createdAt : b.createdAt.toISOString(),
  };
}

export default function UploadedBackupsCard({
  routers,
  initialItems,
}: {
  routers: RouterRow[];
  initialItems: Uploaded[];
}) {
  const [items, setItems] = useState<Uploaded[]>(initialItems);
  const [uploading, startUpload] = useTransition();
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const online = routers.filter((r) => r.status === "online");

  async function refresh() {
    const list = await getOrgUploadedBackups();
    setItems(list.map(toRow));
  }

  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      const res = await uploadRouterBackup(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (res && "error" in res && res.error) {
        setUploadErr(res.error);
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="mt-8">
      <h2 className="font-display text-base font-bold text-ink">
        Restaurer depuis un fichier de sauvegarde (.backup)
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Uploadez une sauvegarde binaire MikroTik (<code>/system backup save</code>) uniquement pour la
        restaurer sur le <strong>même routeur physique, sous la même version RouterOS</strong>. ⚠️ Elle
        remplace TOUTE sa configuration et restaure aussi ses adresses MAC. Pour déplacer tickets et
        profils vers un autre MikroTik, utilisez la sauvegarde SafeLinkHub (logique) ci-dessus. Faites
        «&nbsp;Simuler&nbsp;» d&apos;abord.
      </p>

      {/* Upload */}
      <div className="mt-4 border border-line bg-paper p-4 rounded-xl">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
          <input
            ref={fileRef}
            type="file"
            accept=".backup,application/octet-stream"
            onChange={onUpload}
            disabled={uploading}
            className="hidden"
          />
          <span className="inline-flex items-center gap-2 border border-line bg-brand px-4 py-2 text-slate-deep transition hover:bg-ink hover:text-paper rounded-full">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploading ? "Upload en cours…" : "Choisir un fichier .backup"}
          </span>
        </label>
        {uploadErr && (
          <p role="alert" className="mt-3 border border-err bg-err/10 px-3 py-2 text-sm font-medium text-err">
            {uploadErr}
          </p>
        )}
      </div>

      {/* Liste */}
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-md bg-clay px-3 py-2.5 text-sm text-ink-soft">
            Aucun fichier uploadé pour le moment.
          </p>
        ) : (
          items.map((b) => <UploadedRow key={b.id} backup={b} online={online} onChanged={refresh} />)
        )}
      </div>
    </div>
  );
}

function UploadedRow({
  backup,
  online,
  onChanged,
}: {
  backup: Uploaded;
  online: RouterRow[];
  onChanged: () => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, start] = useTransition();
  const [scan, setScan] = useState<{ plan: ScanPlan; warnings: string[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; steps?: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sameDeviceAndRouterOsConfirmed, setSameDeviceAndRouterOsConfirmed] = useState(false);

  function resetConfirmation() {
    const next = resetBinaryBackupRestoreConfirmation();
    setConfirming(next.confirming);
    setSameDeviceAndRouterOsConfirmed(next.sameDeviceAndRouterOsConfirmed);
  }

  function doScan() {
    if (!targetId) return;
    setMsg(null);
    setScan(null);
    start(async () => {
      const res = await scanUploadedBackupRestore(backup.id, targetId);
      if (res && "success" in res && res.success && res.plan) {
        setScan({ plan: res.plan, warnings: res.warnings ?? [] });
      } else if (res && "error" in res && res.error) {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  function doRestore() {
    if (!targetId) return;
    setMsg(null);
    start(async () => {
      const res = await restoreUploadedBackup(backup.id, targetId, {
        backupPassword: password || undefined,
        sameDeviceAndRouterOsConfirmed,
      });
      resetConfirmation();
      if (res && "success" in res && res.success) {
        setMsg({ ok: true, text: res.summary ?? "Restauration lancée.", steps: res.nextSteps });
      } else if (res && "error" in res && res.error) {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  function doDelete() {
    start(async () => {
      await deleteUploadedBackup(backup.id);
      await onChanged();
    });
  }

  return (
    <div className="border border-line bg-paper">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-bold text-ink">
            {backup.fileName}
            {backup.encrypted && (
              <span className="ml-2 border border-warn px-1.5 py-0.5 text-[11px] font-semibold text-warn">
                chiffré
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {fmtSize(backup.sizeBytes)} · {new Date(backup.createdAt).toLocaleString("fr-FR")}
            {backup.uploadedByName ? ` · ${backup.uploadedByName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={doDelete}
          disabled={busy}
          aria-label="Supprimer"
          className="self-start border border-line-soft p-1.5 text-ink-soft transition hover:border-err hover:text-err disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-line-soft p-4 sm:flex-row sm:items-center">
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            resetConfirmation();
            setScan(null);
            setMsg(null);
          }}
          className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink sm:flex-1 rounded-lg"
        >
          <option value="">Restaurer vers… (routeur cible en ligne)</option>
          {online.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.model ? ` — ${r.model}` : ""}
            </option>
          ))}
        </select>
        {backup.encrypted && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe du backup"
            className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink sm:w-56 rounded-lg"
          />
        )}
        <button
          type="button"
          onClick={doScan}
          disabled={busy || !targetId}
          className="flex items-center justify-center gap-1.5 border border-line bg-paper px-3 py-2 text-sm font-bold text-ink transition hover:bg-clay disabled:opacity-50 rounded-xl"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          Simuler
        </button>
        <button
          type="button"
          onClick={() => {
            resetConfirmation();
            setConfirming(true);
          }}
          disabled={busy || !targetId}
          className="flex items-center justify-center gap-1.5 border border-line bg-brand px-3 py-2 text-sm font-bold text-slate-deep transition hover:bg-ink hover:text-paper disabled:opacity-50 rounded-full"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurer (cloner)
        </button>
      </div>

      {scan && (
        <div className="border-t border-line-soft bg-clay px-4 py-3">
          <p className="text-sm font-bold text-ink">
            Cible : {scan.plan.targetName} — {scan.plan.targetBoard} · RouterOS {scan.plan.targetVersion}
          </p>
          <ul className="mt-2 space-y-1.5">
            {scan.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink-soft">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirming && (
        <div className="border-t border-warn bg-warn/10 px-4 py-3">
          <p className="text-sm font-bold text-ink">
            Confirmer la restauration binaire sur ce routeur ? Toute sa configuration sera remplacée et il
            redémarrera.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={sameDeviceAndRouterOsConfirmed}
              onChange={(event) => setSameDeviceAndRouterOsConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-ink"
            />
            <span>
              Je confirme qu&apos;il s&apos;agit du <strong>même routeur physique</strong> et de la{' '}
              <strong>même version RouterOS</strong>. Pour un routeur de remplacement, je dois utiliser la
              restauration SafeLinkHub (logique).
            </span>
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={doRestore}
              disabled={busy || !sameDeviceAndRouterOsConfirmed}
              className="flex items-center gap-1.5 border border-line bg-brand px-3 py-1.5 text-sm font-bold text-slate-deep transition hover:bg-ink hover:text-paper disabled:opacity-50 rounded-full"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Oui, restaurer
            </button>
            <button
              type="button"
              onClick={resetConfirmation}
              disabled={busy}
              className="border border-line-soft px-3 py-1.5 text-sm font-bold text-ink transition hover:bg-clay rounded-xl"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`border-t px-4 py-3 text-sm ${
            msg.ok ? "border-ok bg-ok/10 text-ink" : "border-err bg-err/10 text-err"
          }`}
        >
          <p className="font-medium">{msg.text}</p>
          {msg.steps && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-soft">
              {msg.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
