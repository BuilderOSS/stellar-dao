'use client';

import type { ComponentProps } from 'react';
import { ark } from '@ark-ui/react/factory';
import { styled } from 'styled-system/jsx';
import { button } from 'styled-system/recipes';

const ButtonBase = styled(ark.button, button);

export function Button({ style, ...props }: ComponentProps<typeof ButtonBase>) {
  return <ButtonBase {...props} style={style} />;
}
