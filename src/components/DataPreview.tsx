import { Table } from 'lucide-react';

interface DataPreviewProps {
  data: {
    headers: string[];
    rows: Record<string, string>[];
  };
}

export default function DataPreview({ data }: DataPreviewProps) {
  const previewRows = data.rows.slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Table className="w-5 h-5 text-[#008192]" />
        <h2 className="text-lg font-semibold text-slate-800">Preview</h2>
        <span className="text-sm text-slate-500 ml-auto">{data.rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              {data.headers.map((header, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border border-slate-200"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-50">
                {data.headers.map((header, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-4 py-3 text-sm text-slate-600 border border-slate-200"
                  >
                    {row[header]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
