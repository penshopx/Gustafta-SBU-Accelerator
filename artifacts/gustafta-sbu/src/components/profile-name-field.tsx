import React, { useId, useState } from 'react';

// Match the API's Unicode-aware check without stripping joiners from real names.
export function hasVisibleNameCharacter(name: string): boolean {
  return /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(name);
}

export function ProfileNameField({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const errorId = useId();
  const [touched, setTouched] = useState(false);
  const invalid = !hasVisibleNameCharacter(value) && (touched || value.length > 0);
  return <>
    <input
      data-testid="input-display-name"
      className="field"
      maxLength={120}
      required
      value={value}
      onChange={event => { setTouched(true); onChange(event.target.value); }}
      onBlur={() => setTouched(true)}
      placeholder="Nama Anda"
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
    />
    {invalid && <span id={errorId} role="alert" className="mt-1.5 block text-sm text-[#b34442]">
      Nama tampilan harus memuat karakter yang terlihat, bukan hanya spasi atau karakter tak terlihat.
    </span>}
  </>;
}
