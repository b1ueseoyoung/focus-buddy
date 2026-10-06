import type { Phase, Recovery, SessionStatus } from '../../../shared/focus/types';
import { formatTimeWithSeconds } from './format';

// Focus 화면의 한국어 문구. 검증 문구는 여기 두지 않고 shared/focus/commands 의 VALIDATION_MESSAGES 를 쓴다.

export const PHASE_LABEL: Record<Phase, string> = {
  focus: '집중',
  short_break: '짧은 휴식',
  long_break: '긴 휴식',
};

export const RESULT_LABEL: Record<SessionStatus, string> = {
  completed: '완료',
  interrupted: '중단',
  skipped: '건너뜀',
  running: '진행 중',
  paused: '일시정지',
};

export const FREE_FOCUS_LABEL = '자유 집중';
export const TASK_PLACEHOLDER = '지금 할 일 (비우면 자유 집중)';
export const LOADING_STATE = '상태를 불러오는 중…';

export const SAVE_FAILED_MESSAGE = '기록을 저장하지 못했어요. 디스크 공간이나 권한을 확인해 주세요.';
export const TRAY_HINT_MESSAGE =
  "창을 닫아도 Focus Buddy는 메뉴 막대에서 계속 실행돼요. 완전히 끄려면 메뉴 막대 아이콘의 'Focus Buddy 종료'를 누르세요.";
export const FOCUS_TIME_NOTE = '실제 집중 시간은 타이머가 실행된 시간이에요.';
export const SETTINGS_APPLY_NOTE = '실행 중에 바꾸면 다음 단계부터 적용돼요.';
export function recoveryMessage(recovery: Recovery): string {
  switch (recovery.kind) {
    case 'crash':
      return `앱이 예기치 않게 종료되어 ${formatTimeWithSeconds(recovery.lastSavedAt ?? recovery.at)} 저장분으로 복구했어요. 그 뒤 시간은 더하지 않았어요.`;
    case 'quit':
      return '지난번 종료 때 진행 중이던 세션을 일시정지했어요.';
    case 'sleep':
      return '절전으로 일시정지했어요. 준비되면 이어 해요.';
    case 'stall':
      return '타이머가 잠시 멈춰서 일시정지했어요.';
    case 'backup':
      // corruptPath 가 없으면 본 파일이 손상된 게 아니라 없어서 백업을 읽은 경우다.
      if (!recovery.corruptPath) return '저장 파일을 찾지 못해 백업에서 복구했어요.';
      return '저장 파일이 손상되어 백업에서 복구했어요. 손상된 파일은 따로 보관했어요.';
    case 'fresh-after-corrupt':
      return '저장 파일이 손상되어 새로 시작했어요. 손상된 파일은 따로 보관했어요.';
  }
}
