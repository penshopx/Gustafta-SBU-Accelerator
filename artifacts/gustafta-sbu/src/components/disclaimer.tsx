import React from 'react';
export const DISCLAIMER_TEXT = 'SBU Accelerator adalah alat bantu persiapan mandiri dan tidak berafiliasi dengan Kementerian PU, LPJK, maupun LSBU. Aplikasi ini tidak menerbitkan atau menjamin SBU.';

export function Disclaimer() {
  return <footer role="contentinfo" data-testid="global-disclaimer" className="print:hidden border-t border-[#2f5f93] bg-[#0a1422] px-5 py-5 md:px-10"><p className="mx-auto max-w-7xl text-center text-xs font-medium leading-6 text-[#e8f3ff]">{DISCLAIMER_TEXT}</p></footer>;
}
