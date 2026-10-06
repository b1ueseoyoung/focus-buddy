import type { FocusBuddyApi, FocusBuddyTestApi } from '../../../shared/focus/types';

// preload 가 노출하는 전역. tsconfig.web.json 은 src/renderer/** 만 보므로 렌더러 쪽에 선언한다.
declare global {
  interface Window {
    focusBuddy?: FocusBuddyApi;
    focusBuddyTest?: FocusBuddyTestApi;
  }
}

export {};
