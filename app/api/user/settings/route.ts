import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { apiKey, customPrompt } = await req.json();
  const dataToUpdate: any = { customPrompt };
  if (apiKey) dataToUpdate.geminiApiKey = apiKey;

  await prisma.user.update({
    where: { id: session.userId },
    data: dataToUpdate,
  });

  return NextResponse.json({ success: true });
}