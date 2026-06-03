"use client";

import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { uploadAvatar, removeAvatar } from "./actions";

type Props = {
  name: string;
  initialAvatarUrl: string | null;
};

export function PhotoUpload({ name, initialAvatarUrl }: Props) {
  return (
    <AvatarUploader
      name={name}
      initialAvatarUrl={initialAvatarUrl}
      upload={uploadAvatar}
      remove={removeAvatar}
      size={112}
      hint="PNG, JPG o WebP. Máximo 4 MB. Se mostrará en tu sidebar y en cualquier listado donde aparezcas."
    />
  );
}
