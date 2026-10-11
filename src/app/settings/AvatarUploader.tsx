"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "@/lib/avatar";
import { removeAvatarAction, uploadAvatarAction, type AvatarState } from "./actions";

/** Crops the picture to a centred square and shrinks it, so uploads stay small whatever the camera. */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  for (const [type, quality] of [["image/webp", 0.85], ["image/jpeg", 0.85], ["image/jpeg", 0.6]] as const) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    // Some browsers can't encode WebP and quietly return PNG; only accept what was asked for.
    if (blob && blob.type === type && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("too large");
}

export function AvatarUploader({ name, current }: { name: string; current: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [state, setState] = useState<AvatarState>({});
  const [pending, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    setState({});
    if (!file) return;
    if (!file.type.startsWith("image/")) return setState({ error: "Please choose a picture file." });
    try {
      const blob = await squareImage(file);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setState({ error: "That picture couldn't be read. Try a JPEG or PNG." });
    }
  }

  function save() {
    if (!preview) return;
    const form = new FormData();
    form.set("avatar", preview.blob, "avatar");
    startTransition(async () => {
      const result = await uploadAvatarAction({}, form);
      setState(result);
      if (result.success) {
        URL.revokeObjectURL(preview.url);
        setPreview(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  function remove() {
    startTransition(async () => setState(await removeAvatarAction()));
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Avatar name={name} src={preview?.url ?? current} size={96} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <input ref={input} id="avatar-file" type="file" accept="image/*" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
          {preview ? (
            <>
              <Button type="button" size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save picture"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} disabled={pending}>Cancel</Button>
            </>
          ) : (
            <>
              <label htmlFor="avatar-file" className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-ink-2 px-4 font-[family-name:var(--font-heading-face)] text-[15px] font-medium hover:bg-surface-2 sm:min-h-11 sm:px-6 sm:text-[16px]">
                {current ? "Change picture" : "Upload picture"}
              </label>
              {current ? <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={pending}>Remove</Button> : null}
            </>
          )}
        </div>
        <p className="text-[13px] text-muted">JPEG, PNG or WebP. It&apos;s cropped to a square and shown at the table.</p>
        {state.error ? <p role="alert" className="text-[14px] text-danger">{state.error}</p> : null}
        {state.success ? <p role="status" className="text-[14px] text-success-fg">{state.success}</p> : null}
      </div>
    </div>
  );
}
