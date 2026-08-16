import ExcelJS from "exceljs"

function cellText(value) {
	if (value === null || value === undefined) return ""
	if (typeof value === "object" && value !== null && "text" in value) return String(value.text)
	if (value instanceof Date) return value.toISOString()
	return String(value)
}

export async function readExcel(path, sheetName, maxRows) {
	const workbook = new ExcelJS.Workbook()
	await workbook.xlsx.readFile(path)
	const sheet = sheetName
		? workbook.getWorksheet(sheetName)
		: workbook.worksheets[0]
	if (!sheet) {
		const names = workbook.worksheets.map((item) => item.name)
		throw new Error(`找不到工作表${sheetName ? ` ${sheetName}` : ""}。已有：${names.join(", ") || "(空)"}`)
	}
	const limit = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 500
	const rows = []
	sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rows.length >= limit) return
		const values = Array.isArray(row.values) ? row.values.slice(1) : []
		rows.push({ row: rowNumber, values: values.map(cellText) })
	})
	return {
		path,
		sheet: sheet.name,
		sheets: workbook.worksheets.map((item) => item.name),
		rowCount: rows.length,
		truncated: sheet.rowCount > rows.length,
		rows,
	}
}

export async function writeExcel(path, sheetName, headers, rows) {
	const workbook = new ExcelJS.Workbook()
	const sheet = workbook.addWorksheet(sheetName || "Sheet1")
	if (Array.isArray(headers) && headers.length > 0) {
		const headerRow = sheet.addRow(headers.map((item) => String(item)))
		headerRow.font = { bold: true }
	}
	for (const row of rows) {
		if (Array.isArray(row)) {
			sheet.addRow(row.map((item) => item ?? ""))
			continue
		}
		if (row && typeof row === "object") {
			const keys = Array.isArray(headers) && headers.length > 0 ? headers : Object.keys(row)
			sheet.addRow(keys.map((key) => row[key] ?? ""))
			continue
		}
		sheet.addRow([row])
	}
	sheet.columns?.forEach((column) => {
		let width = 10
		column.eachCell?.({ includeEmpty: true }, (cell) => {
			width = Math.max(width, String(cell.value ?? "").length + 2)
		})
		column.width = Math.min(width, 40)
	})
	await workbook.xlsx.writeFile(path)
	return { path, sheet: sheet.name, rowsWritten: rows.length }
}
