import React from 'react';

export function AllSetCard() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#D6E6FF] bg-[#F0F6FF] p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-white shadow-sm">
        <span className="material-symbols-outlined text-[32px] text-[#1A73E8]">verified_user</span>
      </span>
      <div>
        <h3 className="text-[16px] font-bold text-[#1E293B]">All Set!</h3>
        <p className="mt-1 text-[13px] text-[#64748B]">Your system is running smoothly.</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-3 py-1 text-[12px] font-semibold text-[#059669]">
        <span className="material-symbols-outlined text-[14px]">check_circle</span>
        No urgent issues
      </span>
    </div>
  );
}
