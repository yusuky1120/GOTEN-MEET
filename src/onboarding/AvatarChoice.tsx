import { useEffect, useRef } from 'react';
import { drawAvatar } from '../avatar/drawAvatar';
import {
  AVATAR_TYPES,
  avatarTypeLabel,
  type AvatarType,
} from '../avatar/avatarTypes';
import { DEFAULT_CLOTHING_PALETTE } from '../game/playerClothing';

export type AvatarChoiceProps = {
  value: AvatarType;
  onChange: (value: AvatarType) => void;
  disabled?: boolean;
};

function AvatarPreview({ avatarType }: { avatarType: AvatarType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawAvatar(context, {
      avatarType,
      pose: 'idle',
      clothing: DEFAULT_CLOTHING_PALETTE,
    });
  }, [avatarType]);

  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={56}
      className="avatar-choice__preview"
      aria-hidden="true"
    />
  );
}

export default function AvatarChoice({ value, onChange, disabled }: AvatarChoiceProps) {
  return (
    <fieldset className="avatar-choice" disabled={disabled}>
      <legend>アバター</legend>
      <div className="avatar-choice__options" role="radiogroup" aria-label="アバター">
        {AVATAR_TYPES.map((avatarType) => {
          const checked = value === avatarType;
          return (
            <label
              key={avatarType}
              className={
                checked
                  ? 'avatar-choice__card avatar-choice__card--selected'
                  : 'avatar-choice__card'
              }
            >
              <input
                type="radio"
                name="avatarType"
                value={avatarType}
                checked={checked}
                aria-checked={checked}
                disabled={disabled}
                onChange={() => onChange(avatarType)}
              />
              <AvatarPreview avatarType={avatarType} />
              <span className="avatar-choice__label">{avatarTypeLabel(avatarType)}</span>
              {checked ? (
                <span className="avatar-choice__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
