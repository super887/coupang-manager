import { PrismaClient } from '@prisma/client';

// [확장성 포인트]: Next.js 개발 환경(dev)에서는 코드를 수정할 때마다 서버가 재시작(HMR)됩니다.
// 이때 PrismaClient가 무한 증식해서 DB 연결이 터지는 것을 막기 위한 '싱글톤(Singleton)' 패턴입니다.
// 나중에 서버 규모가 커져도 DB 커넥션을 안전하게 하나만 유지합니다.

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;