"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">エラーが発生しました</h2>
        <p className="text-sm text-slate-500 mb-6">{error.message || "予期しないエラーが発生しました。"}</p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
