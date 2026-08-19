'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, Heading, ShortId, Text } from '@/components/ui';
import { useTokenMetadata } from '@/lib/token-queries';

export function TokenCard({ tokenId, owner }: { tokenId: number; owner: string }) {
  const { data, error, isLoading } = useTokenMetadata(tokenId);

  return (
    <Card p="5">
      {isLoading ? (
        <Text className="lede" style={{ margin: 0 }}>Loading token...</Text>
      ) : error ? (
        <Text className="lede" style={{ margin: 0 }}>{error.message}</Text>
      ) : data ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          <Link href={`/token/${tokenId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Image
                src={data.image}
                alt={data.name}
                width={256}
                height={256}
                unoptimized
                style={{ width: '100%', height: 'auto', borderRadius: '20px' }}
              />
              <div>
                <Text className="label" style={{ marginBottom: '6px' }}>Token #{tokenId}</Text>
                <Heading style={{ fontSize: '1.2rem', margin: 0 }}>{data.name}</Heading>
              </div>
            </div>
          </Link>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{data.description}</Text>
          <div style={{ display: 'grid', gap: '6px' }}>
            <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Symbol: {data.attributes.find((attribute) => attribute.trait_type === 'Token Symbol')?.value ?? '—'}</Text>
            <ShortId value={owner} label="Owner" />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
