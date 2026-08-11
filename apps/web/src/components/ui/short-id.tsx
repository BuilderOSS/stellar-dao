'use client';

import { useState } from 'react';
import { CopyIconButton, Text } from '@/components/ui';
import { HStack } from 'styled-system/jsx';

function shorten(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export function ShortId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const displayValue = shorten(value);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <HStack gap="2" justify="space-between">
      <div style={{ minWidth: 0 }}>
        {label ? <Text className="label">{label}</Text> : null}
        <Text className="mono" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
          {displayValue}
        </Text>
      </div>
      <HStack gap="1">
        <CopyIconButton copied={copied} onClick={copyValue} label="Copy address" />
      </HStack>
    </HStack>
  );
}
