/** Validação do upload outbound (Onda 2). Allowlist por categoria + cap 50MB. */
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

export type MessageKind = "image" | "video" | "audio" | "document";

/**
 * Posse do objeto no bucket: o path DEVE estar sob {org}/{conversation}/
 * (chaves do Storage são literais — sem semântica de traversal).
 *
 * Morava dentro do módulo de transporte do provider legado e não tinha nada a
 * ver com o canal: valida um path do NOSSO Storage, antes de qualquer coisa
 * tocar um provider. Ficar lá obrigava o handler de envio a importar do módulo
 * do provider — o acoplamento que o invariante 1 de
 * `docs/doctrine/restricao-de-canal.md` proíbe.
 */
export function isMediaPathOwnedBy(path: string, orgId: string, conversationId: string): boolean {
  return path.startsWith(`${orgId}/${conversationId}/`);
}

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
]);

// Não aceite SVG/HTML ou um MIME inventado só por começar com image/.
const MEDIA_MIMES: Readonly<Record<string, MessageKind>> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/gif": "image",
  "video/mp4": "video", "video/3gpp": "video", "video/webm": "video", "video/quicktime": "video",
  "audio/mpeg": "audio", "audio/mp4": "audio", "audio/aac": "audio", "audio/ogg": "audio",
  "audio/webm": "audio", "audio/wav": "audio", "audio/x-wav": "audio", "audio/amr": "audio",
};

type Ok = { ok: true; kind: MessageKind };
type Fail = { ok: false; code: "unsupported_media_type" | "payload_too_large" | "validation_failed"; message: string };

export function validateOutboundMedia(mime: string, sizeBytes: number): Ok | Fail {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, code: "validation_failed", message: "Arquivo vazio." };
  }
  if (sizeBytes > MAX_MEDIA_BYTES) {
    return { ok: false, code: "payload_too_large", message: "Arquivo acima de 50MB." };
  }
  const base = mime.split(";")[0]!.trim().toLowerCase();
  const kind = Object.hasOwn(MEDIA_MIMES, base) ? MEDIA_MIMES[base] : undefined;
  if (kind) return { ok: true, kind };
  if (DOCUMENT_MIMES.has(base)) return { ok: true, kind: "document" };
  return { ok: false, code: "unsupported_media_type", message: "Tipo de arquivo não suportado." };
}
