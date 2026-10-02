import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function visiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const maxVisible = 10;

  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = currentPage - half;
  let end = currentPage + half - 1;

  if (start < 1) {
    start = 1;
    end = maxVisible;
  }

  if (end > totalPages) {
    end = totalPages;
    start = totalPages - maxVisible + 1;
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const buttonBase =
  "w-10 h-10 inline-flex items-center justify-center rounded-lg text-sm cursor-pointer transition-colors disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed";
const buttonIdle = "border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 active:bg-primary-300";
const buttonActive = "bg-primary-500 text-white font-bold";

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  };

  return (
    <nav aria-label="ページネーション">
      <ul className="flex items-center gap-1 flex-wrap justify-center">
        <li>
          <button
            className={cn(buttonBase, buttonIdle)}
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            aria-label="最初のページ"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </li>
        <li>
          <button
            className={cn(buttonBase, buttonIdle)}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="前のページ"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </li>

        {visiblePageNumbers(currentPage, totalPages).map((page) => (
          <li key={page}>
            <button
              className={cn(buttonBase, currentPage === page ? buttonActive : buttonIdle)}
              onClick={() => goToPage(page)}
              aria-current={currentPage === page ? "page" : undefined}
            >
              {page}
            </button>
          </li>
        ))}

        <li>
          <button
            className={cn(buttonBase, buttonIdle)}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="次のページ"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </li>
        <li>
          <button
            className={cn(buttonBase, buttonIdle)}
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="最後のページ"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
