export function getPageNumbers(
  currentPage: number,
  totalPages: number
): (number | string)[] {

  const pages: (number | string)[] = [];

  const maxVisible = 4;

  // แสดงทั้งหมดถ้าหน้าน้อย
  if (totalPages <= maxVisible + 2) {

    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    return pages;
  }

  // อยู่ต้น
  if (currentPage <= maxVisible) {

    for (let i = 1; i <= maxVisible; i++) {
      pages.push(i);
    }

    pages.push('...');
    pages.push(totalPages);

    return pages;
  }

  // อยู่ท้าย
  if (currentPage > totalPages - maxVisible) {

    pages.push(1);
    pages.push('...');

    for (
      let i = totalPages - maxVisible + 1;
      i <= totalPages;
      i++
    ) {
      pages.push(i);
    }

    return pages;
  }

  // อยู่กลาง
  pages.push(1);
  pages.push('...');

  pages.push(currentPage - 1);
  pages.push(currentPage);
  pages.push(currentPage + 1);

  pages.push('...');
  pages.push(totalPages);

  return pages;
}