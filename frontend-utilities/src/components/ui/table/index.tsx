import { ReactNode } from 'react';

// Table
interface TableProps extends React.ComponentProps<'table'> {
  children: ReactNode;
}

const Table: React.FC<TableProps> = ({ children, className, ...rest }) => {
  return (
    <table className={`w-full ${className || ''}`} {...rest}>
      {children}
    </table>
  );
};

// TableHeader
interface TableHeaderProps extends React.ComponentProps<'thead'> {
  children: ReactNode;
}

const TableHeader: React.FC<TableHeaderProps> = ({ children, className, ...rest }) => {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  );
};

// TableBody
interface TableBodyProps extends React.ComponentProps<'tbody'> {
  children: ReactNode;
}

const TableBody: React.FC<TableBodyProps> = ({ children, className, ...rest }) => {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
};

// TableRow
interface TableRowProps extends React.ComponentProps<'tr'> {
  children: ReactNode;
}

const TableRow: React.FC<TableRowProps> = ({ children, className, ...rest }) => {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
};

// TableCell
interface TableCellProps extends React.ThHTMLAttributes<HTMLTableCellElement>, React.TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  isHeader?: boolean;
}

const TableCell: React.FC<TableCellProps> = ({ children, isHeader = false, className, ...rest }) => {
  const CellTag = isHeader ? 'th' : 'td';

  return (
    <CellTag className={className} {...rest}>
      {children}
    </CellTag>
  );
};

export { Table, TableHeader, TableBody, TableRow, TableCell };
