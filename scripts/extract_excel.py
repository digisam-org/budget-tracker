import zipfile
import xml.etree.ElementTree as ET
import json
import os
from datetime import datetime, timedelta

def excel_date_to_iso(serial):
    try:
        d = datetime(1899, 12, 30) + timedelta(days=float(serial))
        return d.strftime('%Y-%m-%d')
    except:
        return None

def extract_excel_data(excel_path):
    with zipfile.ZipFile(excel_path) as z:
        sst_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        strings = [''.join([t.text or '' for t in si.findall('.//main:t', ns)]) for si in sst_tree.findall('.//main:si', ns)]

        wb_tree = ET.fromstring(z.read('xl/workbook.xml'))
        rels_tree = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels_tree}

        # 1. Parse Settings
        settings = {
            'startingYear': 2026,
            'shiftLateIncome': False,
            'lateIncomeDay': 20,
            'savingsRateType': 'active'
        }
        for s in wb_tree.findall('.//main:sheet', ns):
            if s.attrib['name'] == 'Settings':
                target = 'xl/' + rel_map[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
                sheet_tree = ET.fromstring(z.read(target))
                for row in sheet_tree.findall('.//main:row', ns):
                    cells = {}
                    for c in row.findall('main:c', ns):
                        col = ''.join([ch for ch in c.attrib.get('r') if ch.isalpha()])
                        t = c.attrib.get('t')
                        v = c.find('main:v', ns)
                        val = v.text if v is not None else ''
                        if t == 's' and val.isdigit():
                            val = strings[int(val)]
                        cells[col] = val
                    if cells.get('D') == 'Starting Year:' and cells.get('E'):
                        settings['startingYear'] = int(cells.get('E'))
                    elif cells.get('D') == 'Shift late income:' and cells.get('E'):
                        settings['shiftLateIncome'] = cells.get('E').strip().lower() == 'active'
                    elif cells.get('D') == 'Starting on day x in month:' and cells.get('E'):
                        settings['lateIncomeDay'] = int(float(cells.get('E')))
                    elif cells.get('D') == 'Savings Rate as % of Income:' and cells.get('E'):
                        settings['savingsRateType'] = 'active' if '% allocated to Savings' in cells.get('E') else 'passive'

        # 2. Parse Budget Planning
        bp_target = 'xl/' + rel_map[[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'] for s in wb_tree.findall('.//main:sheet', ns) if s.attrib['name'] == 'Budget Planning'][0]]
        bp_tree = ET.fromstring(z.read(bp_target))

        month_cols = {'E': 1, 'F': 2, 'G': 3, 'H': 4, 'I': 5, 'J': 6, 'K': 7, 'L': 8, 'M': 9, 'N': 10, 'O': 11, 'P': 12}
        categories = []
        budget_plans = []
        cat_name_to_id = {}

        current_type = None
        sort_order = 1
        for row in bp_tree.findall('.//main:row', ns):
            cells = {}
            for c in row.findall('main:c', ns):
                col = ''.join([ch for ch in c.attrib.get('r') if ch.isalpha()])
                t = c.attrib.get('t')
                v = c.find('main:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    val = strings[int(val)]
                cells[col] = val
            
            name = cells.get('C', '').strip()
            if name in ['Income', 'Expenses', 'Savings']:
                current_type = name.lower()
                continue
            if name.startswith('Enter ') or name in ['Total', 'To be allocated:', '']:
                continue
            
            if current_type and name:
                cat_id = 'cat_' + name.lower().replace(' ', '_').replace('&', 'and').replace('(', '').replace(')', '').replace('/', '_').strip('_')
                cat_name_to_id[name.lower()] = cat_id
                
                # Check if this category is in Glasgow Flat / Rental
                subgroup = 'General'
                if 'glasgow' in name.lower() or 'rent' in name.lower() or 'flat' in name.lower():
                    subgroup = 'Rental Property'
                elif name in ['Housing', 'Taxes', 'Utilities']:
                    subgroup = 'Fixed Bills'
                elif name in ['Groceries', 'Eating Out', 'Shopping', 'Entertainment', 'Transport']:
                    subgroup = 'Living'
                elif current_type == 'savings':
                    subgroup = 'Investments & Savings'

                categories.append({
                    'id': cat_id,
                    'name': name,
                    'type': current_type,
                    'subgroup': subgroup,
                    'isSavingsTransfer': current_type == 'savings',
                    'sortOrder': sort_order
                })
                sort_order += 1

                for col_letter, month_num in month_cols.items():
                    amt_str = cells.get(col_letter, '')
                    if amt_str:
                        try:
                            amt_pence = round(float(amt_str) * 100)
                            budget_plans.append({
                                'categoryId': cat_id,
                                'year': settings['startingYear'],
                                'month': month_num,
                                'plannedAmount': amt_pence
                            })
                        except:
                            pass

        # 3. Parse Budget Tracking Transactions
        bt_target = 'xl/' + rel_map[[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'] for s in wb_tree.findall('.//main:sheet', ns) if s.attrib['name'] == 'Budget Tracking'][0]]
        bt_tree = ET.fromstring(z.read(bt_target))
        
        transactions = []
        for row in bt_tree.findall('.//main:row', ns):
            r_idx = row.attrib.get('r')
            if int(r_idx) < 12: continue
            cells = {}
            for c in row.findall('main:c', ns):
                col = ''.join([ch for ch in c.attrib.get('r') if ch.isalpha()])
                t = c.attrib.get('t')
                v = c.find('main:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    val = strings[int(val)]
                cells[col] = val
            
            date_val = cells.get('C')
            tx_type = cells.get('D', '').strip()
            cat_name = cells.get('E', '').strip()
            amount_val = cells.get('F')
            details = cells.get('G', '').strip()
            eff_date_val = cells.get('I')

            if date_val and tx_type and cat_name and amount_val:
                iso_date = excel_date_to_iso(date_val)
                eff_iso_date = excel_date_to_iso(eff_date_val) if eff_date_val else iso_date
                try:
                    raw_float = float(amount_val)
                    # Income is positive; Expenses & Savings outflows are negative
                    amount_pence = round(raw_float * 100)
                    if tx_type.lower() in ['expenses', 'savings']:
                        amount_pence = -abs(amount_pence)
                    else:
                        amount_pence = abs(amount_pence)

                    cat_id = cat_name_to_id.get(cat_name.lower())
                    if not cat_id:
                        cat_id = 'cat_' + cat_name.lower().replace(' ', '_').replace('&', 'and').replace('(', '').replace(')', '').replace('/', '_').strip('_')

                    transactions.append({
                        'date': iso_date,
                        'effectiveDate': eff_iso_date,
                        'type': tx_type.lower(),
                        'categoryName': cat_name,
                        'categoryId': cat_id,
                        'amount': amount_pence,
                        'details': details,
                    })
                except Exception as e:
                    pass

        return {
            'settings': settings,
            'categories': categories,
            'budgetPlans': budget_plans,
            'transactions': transactions
        }

if __name__ == '__main__':
    excel_file = 'public/research/Ultimate Personal Budget Extended.xlsx'
    data = extract_excel_data(excel_file)
    output_path = 'src/lib/db/excel-seed-data.json'
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"✅ Successfully wrote {len(data['categories'])} categories, {len(data['budgetPlans'])} plans, and {len(data['transactions'])} transactions to {output_path}")
