import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/radixUI/select';

interface PaginationProps<T> {
  filteredData: T[];
  totalPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pagesLists: (string | number)[];
  rowsPerPage: number;
  setRowsPerPage: (page: number) => void;
  rowPerPageText: {
    display: string;
    row: string;
  };
}

export default function Pagination<T>({
  filteredData,
  totalPages,
  currentPage,
  setCurrentPage,
  pagesLists,
  setRowsPerPage,
  rowsPerPage,
  rowPerPageText,
}: PaginationProps<T>) {
  const rpp = rowPerPageText;

  return (
    <div className="p-4 flex justify-center sm:justify-between items-center flex-col sm:flex-row gap-4">
      {/* Pagination buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
          className="px-2 py-1 border dark:border-gray-800 dark:text-white/[0.3] rounded-md text-sm disabled:opacity-50"
        >
          &lt;
        </button>

        {pagesLists?.map((page, idx) =>
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-3 py-1 text-gray-500">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => setCurrentPage(page as number)}
              className={`px-3 py-1 border dark:border-gray-800 dark:text-white/[0.8] rounded-md text-sm ${page === currentPage ? 'bg-blue-500 text-white' : 'text-gray-700'}`}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-2 py-1 border dark:border-gray-800 dark:text-white/[0.3] rounded-md text-sm disabled:opacity-50"
        >
          &gt;
        </button>
      </div>

      {/* Summary + Rows per page */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span>{rpp.display}</span>
        <Select
          value={rowsPerPage.toString()}
          onValueChange={(value) => {
            setRowsPerPage?.(Number(value));
            setCurrentPage(1); // รีเซ็ตไปหน้าแรก
          }}
        >
          <SelectTrigger className="w-18 h-8">
            <SelectValue placeholder="20" />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100, 500, 1000].map((n) => (
              <SelectItem key={n} value={n.toString()}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          {rpp.row
            .replace(
              '[cr]',
              `${((currentPage - 1) * rowsPerPage + 1).toLocaleString()}
          –
          ${Math.min(currentPage * rowsPerPage, filteredData.length).toLocaleString()}`
            )
            .replace('[tr]', filteredData.length.toLocaleString())}
        </span>
      </div>
    </div>
  );
}
