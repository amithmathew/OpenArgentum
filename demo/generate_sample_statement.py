"""Generate a realistic-looking bank statement PDF for demo purposes."""
from fpdf import FPDF
from datetime import date, timedelta
import random

random.seed(99)

class StatementPDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def generate_statement():
    pdf = StatementPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Bank header
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(0, 100, 60)
    pdf.cell(0, 10, "Maple Leaf Banking", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, "Personal Banking Division", ln=True)
    pdf.cell(0, 5, "PO Box 1234, Toronto, ON M5H 1T1", ln=True)
    pdf.ln(5)

    # Statement info
    pdf.set_draw_color(0, 100, 60)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 7, "Chequing Account Statement", ln=True)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(60, 60, 60)
    info = [
        ("Account Holder:", "Jordan Chen"),
        ("Account Number:", "****-****-7842"),
        ("Statement Period:", "May 1, 2026 - May 31, 2026"),
        ("Opening Balance:", "$4,231.56"),
    ]
    for label, value in info:
        pdf.cell(40, 5, label)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, value, ln=True)
        pdf.set_font("Helvetica", "", 9)

    pdf.ln(5)

    # Transactions
    transactions = [
        ("2026-05-01", "Employer Direct Deposit - Payroll", 4850.00),
        ("2026-05-01", "Rent Payment - Landlord", -1950.00),
        ("2026-05-02", "Loblaws #1247", -87.43),
        ("2026-05-02", "Presto Transit Auto-Load", -150.00),
        ("2026-05-03", "Netflix Subscription", -17.99),
        ("2026-05-03", "Spotify Premium", -11.99),
        ("2026-05-04", "Shell Gas Station", -62.14),
        ("2026-05-05", "Tim Hortons #0892", -6.45),
        ("2026-05-05", "Amazon.ca - Electronics", -129.99),
        ("2026-05-06", "Metro Grocery", -54.32),
        ("2026-05-07", "Hydro One - Electricity", -95.67),
        ("2026-05-07", "Bell Canada - Mobile", -65.00),
        ("2026-05-08", "Swiss Chalet", -38.50),
        ("2026-05-09", "GoodLife Fitness", -55.37),
        ("2026-05-10", "E-Transfer Received - M. Park", 200.00),
        ("2026-05-10", "T&T Supermarket", -112.87),
        ("2026-05-11", "Starbucks", -7.25),
        ("2026-05-12", "Canadian Tire", -43.98),
        ("2026-05-13", "Cineplex Odeon", -28.50),
        ("2026-05-14", "Rogers Internet", -79.99),
        ("2026-05-15", "Employer Direct Deposit - Payroll", 4850.00),
        ("2026-05-15", "Enbridge Gas", -62.33),
        ("2026-05-16", "Farm Boy", -67.21),
        ("2026-05-17", "Home Depot", -156.43),
        ("2026-05-18", "Pho Dau Bo Restaurant", -32.50),
        ("2026-05-19", "Costco Wholesale", -198.76),
        ("2026-05-20", "Apple iCloud Storage", -3.99),
        ("2026-05-21", "Walmart Grocery", -72.15),
        ("2026-05-22", "Manulife Insurance", -148.50),
        ("2026-05-23", "Tim Hortons #0892", -5.95),
        ("2026-05-24", "LCBO", -45.80),
        ("2026-05-25", "Uber Eats", -36.72),
        ("2026-05-26", "No Frills #384", -38.44),
        ("2026-05-27", "Steam Games", -54.99),
        ("2026-05-28", "Petro-Canada", -58.32),
        ("2026-05-29", "Indigo Books", -22.99),
        ("2026-05-30", "Transfer to Savings", -500.00),
        ("2026-05-31", "TD Insurance - Auto", -124.50),
    ]

    # Table header
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(240, 245, 240)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(25, 7, "Date", border=1, fill=True)
    pdf.cell(110, 7, "Description", border=1, fill=True)
    pdf.cell(25, 7, "Amount", border=1, align="R", fill=True)
    pdf.cell(25, 7, "Balance", border=1, align="R", fill=True, ln=True)

    # Table rows
    pdf.set_font("Helvetica", "", 8.5)
    balance = 4231.56
    for dt, desc, amt in transactions:
        balance += amt
        # Alternate row color
        pdf.set_text_color(40, 40, 40)
        pdf.cell(25, 6, dt, border="LR")
        pdf.cell(110, 6, desc, border="LR")

        if amt >= 0:
            pdf.set_text_color(0, 120, 60)
            amt_str = f"${amt:,.2f}"
        else:
            pdf.set_text_color(180, 30, 30)
            amt_str = f"-${abs(amt):,.2f}"
        pdf.cell(25, 6, amt_str, border="LR", align="R")

        pdf.set_text_color(40, 40, 40)
        pdf.cell(25, 6, f"${balance:,.2f}", border="LR", align="R", ln=True)

    # Close table bottom
    pdf.cell(185, 0, "", border="T")
    pdf.ln(8)

    # Summary
    total_credits = sum(a for _, _, a in transactions if a > 0)
    total_debits = sum(a for _, _, a in transactions if a < 0)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 7, "Account Summary", ln=True)
    pdf.set_font("Helvetica", "", 9)

    summary = [
        ("Total Credits:", f"${total_credits:,.2f}"),
        ("Total Debits:", f"-${abs(total_debits):,.2f}"),
        ("Closing Balance:", f"${balance:,.2f}"),
    ]
    for label, value in summary:
        pdf.cell(40, 5, label)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, value, ln=True)
        pdf.set_font("Helvetica", "", 9)

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(140, 140, 140)
    pdf.multi_cell(0, 4, "This statement is provided for informational purposes. "
                   "Please review all transactions and report any discrepancies within 30 days. "
                   "Maple Leaf Banking is a registered trademark. Member CDIC.")

    out_path = "demo/sample_statement.pdf"
    pdf.output(out_path)
    print(f"Generated: {out_path} ({len(transactions)} transactions)")


if __name__ == "__main__":
    generate_statement()
