import { net, protocol } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

/** ready 전에 호출: 패키지 렌더러를 app://renderer/ 로 서빙하기 위한 특권 스킴 (D5). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true, secure: true, supportFetchAPI: true, stream: true,
      },
    },
  ]);
}

const status = (code: number): Response => new Response(null, { status: code });

/** ready 후에 호출. rendererRoot 밖의 파일은 돌려주지 않는다. */
export function handleAppProtocol(): void {
  const rendererRoot = path.join(__dirname, '../renderer');

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'renderer') return status(404);

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return status(403);
    }

    const target = path.resolve(rendererRoot, `.${pathname}`);
    if (!target.startsWith(rendererRoot + path.sep)) return status(403);

    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      // 없는 파일: net.fetch(file://)는 응답 대신 예외를 던진다.
      return status(404);
    }
  });
}
