from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, ListFlowable, ListItem
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from xml.sax.saxutils import escape
from pathlib import Path


OUT = Path("output/pdf")
OUT.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#17324D")
TEAL = colors.HexColor("#157A7A")
GOLD = colors.HexColor("#D69E2E")
PALE = colors.HexColor("#F2F7F8")
LIGHT = colors.HexColor("#E9F0F3")
INK = colors.HexColor("#1F2933")
MUTED = colors.HexColor("#52606D")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=25, leading=30, textColor=WHITE, alignment=TA_LEFT, spaceAfter=8
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=11, leading=16, textColor=colors.HexColor("#E8F1F4"), alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=17, leading=21, textColor=NAVY, spaceBefore=12, spaceAfter=8,
    keepWithNext=True
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12.5, leading=16, textColor=TEAL, spaceBefore=9, spaceAfter=5,
    keepWithNext=True
))
styles.add(ParagraphStyle(
    name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.3, leading=13.2, textColor=INK, spaceAfter=5
))
styles.add(ParagraphStyle(
    name="Smallx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.5, leading=10, textColor=MUTED, spaceAfter=3
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=WHITE, alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.6, leading=9.6, textColor=INK, alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=10, leading=14, textColor=NAVY, backColor=PALE,
    borderColor=TEAL, borderWidth=0.8, borderPadding=8, spaceBefore=5, spaceAfter=8
))
styles.add(ParagraphStyle(
    name="Footer", parent=styles["Normal"], fontName="Helvetica",
    fontSize=7.5, leading=9, textColor=MUTED
))


def p(text, style="Bodyx"):
    return Paragraph(escape(text).replace("\n", "<br/>"), styles[style])


def rich(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullets(items, level=0):
    return ListFlowable(
        [ListItem(p(item, "Bodyx"), leftIndent=12) for item in items],
        bulletType="bullet", start="circle", leftIndent=18 + level * 10,
        bulletFontName="Helvetica", bulletFontSize=6, bulletOffsetY=2
    )


def numbered(items):
    return ListFlowable(
        [ListItem(p(item, "Bodyx"), leftIndent=12) for item in items],
        bulletType="1", leftIndent=20, bulletFontName="Helvetica",
        bulletFontSize=8, bulletOffsetY=1
    )


def make_table(data, widths, header=True, font_size=7.6):
    cooked = []
    for r, row in enumerate(data):
        cooked.append([
            Paragraph(escape(str(cell)), styles["TableHead" if header and r == 0 else "TableCell"])
            for cell in row
        ])
    t = Table(cooked, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C8D4DA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE)]
        if len(data) > 1:
            for i in range(1, len(data)):
                commands.append(("BACKGROUND", (0, i), (-1, i), WHITE if i % 2 else PALE))
    t.setStyle(TableStyle(commands))
    return t


def cover(title, subtitle, profile):
    box = Table([
        [rich(f"<font color='#FFFFFF'><b>{escape(title)}</b></font>", "CoverTitle")],
        [rich(escape(subtitle), "CoverSub")],
        [Spacer(1, 0.12 * inch)],
        [rich(f"<font color='#D8EEF0'><b>Profile used:</b> {escape(profile)}</font>", "CoverSub")],
    ], colWidths=[7.0 * inch])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (-1, -1), 15),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
    ]))
    return [box, Spacer(1, 0.16 * inch)]


def footer(title):
    def draw(canvas, doc):
        canvas.saveState()
        w, h = letter
        canvas.setStrokeColor(colors.HexColor("#D7E1E5"))
        canvas.setLineWidth(0.5)
        canvas.line(0.65 * inch, 0.48 * inch, w - 0.65 * inch, 0.48 * inch)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.65 * inch, 0.29 * inch, title)
        canvas.drawRightString(w - 0.65 * inch, 0.29 * inch, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def build_pdf(path, title, story):
    doc = SimpleDocTemplate(
        str(path), pagesize=letter, rightMargin=0.65 * inch, leftMargin=0.65 * inch,
        topMargin=0.62 * inch, bottomMargin=0.62 * inch, title=title, author="Codex"
    )
    doc.build(story, onFirstPage=footer(title), onLaterPages=footer(title))


def sources(items):
    out = [p("Sources and verification links", "H1x")]
    for label, url in items:
        out.append(rich(f"<b>{escape(label)}</b> | <font size='6.5'>{escape(url)}</font>", "Smallx"))
    return [KeepTogether(out)]


def body_pdf():
    s = []
    s += cover(
        "Goal 1: Body Transformation",
        "A safe seven-month fat-loss, strength, sleep, and nutrition plan for a night-shift worker",
        "Age 23 | 174 cm | 95 kg | Ontario | GEODIS night shift | No gym months 1-4"
    )
    s.append(rich("<b>Outcome to pursue</b>: reach approximately 78-83 kg in seven months while preserving strength, improving sleep and work capacity, and building habits that can continue toward a lean athletic physique.", "Callout"))
    s.append(p("This is educational planning, not a diagnosis or individualized prescription. Because sex, medical history, and exact activity are not specified, calorie numbers are starting estimates and must be adjusted using your actual weight trend."))

    s.append(rich("1. Reality check", "H1x"))
    s.append(p("At 174 cm, 95 kg corresponds to a BMI of about 31.4. At 65 kg, BMI would be about 21.5, which is within the conventional healthy BMI range. BMI is only a screening measure and does not determine the best muscular or athletic weight."))
    s.append(p("A safe seven-month loss is about 0.4-0.8 kg per week. A target of 78-83 kg is realistic; 65 kg is a longer-term option only if your waist, strength, energy, and health remain good. Approximately 8% body fat is not required for health. For a male it is very lean and difficult to maintain; for a female it would generally be dangerously low."))
    s.append(p("Face and belly fat cannot be reduced selectively. Facial definition and a visible waist improve through overall fat loss, resistance training, sleep, posture, hydration, and genetics. Avoid jaw exercisers, dehydration, starvation, and unregulated fat-loss products."))

    s.append(rich("2. Seven-month body targets", "H1x"))
    s.append(make_table([
        ["Month", "Weight trend", "Strength", "Cardio and steps", "Recovery focus"],
        ["1", "1.5-3 kg loss", "2 full-body sessions/week", "90-120 min; 6,000 steps", "Set sleep anchor; log food"],
        ["2", "7,000-8,000 steps", "3 sessions/week", "120-150 min", "Protein consistency"],
        ["3", "8,000-9,000 steps", "3 sessions; add backpack load", "150-180 min", "Improve technique"],
        ["4", "9,000-10,000 steps", "3 sessions; harder variations", "180-210 min", "Prepare for gym"],
        ["5", "Begin gym; maintain loss", "3 full-body gym sessions", "2 moderate cardio sessions", "Do not train through fatigue"],
        ["6", "Continue 0.4-0.7 kg/week", "Progress weight slowly", "150-210 min", "One easier week if needed"],
        ["7", "Approximately 78-83 kg", "Reassess strength and waist", "Maintain sustainable volume", "Choose next long-term phase"],
    ], [0.58*inch, 1.18*inch, 1.55*inch, 1.6*inch, 2.09*inch]))

    s.append(rich("3. Calories, protein, and meal structure", "H1x"))
    s.append(p("Start with a two-week calibration at approximately 2,400 kcal per day on average and 140-160 g protein. Weigh after waking, calculate a seven-day average, and change calories only from the trend. If you are not male or your activity is much lower than assumed, use a calorie calculator or a registered dietitian to refine the starting number."))
    s.append(p("Aim for approximately 1.6-2.0 g protein per kilogram of target body weight. For a target around 78-83 kg, 140-160 g per day is practical. Divide protein across three or four meals."))
    s.append(make_table([
        ["Timing", "Low-cost template"],
        ["After waking", "Oats, Greek yogurt, berries or banana, peanut butter, and eggs"],
        ["Before shift", "Chicken thighs, tofu, lentils, or beans with rice or potatoes and frozen vegetables"],
        ["Mid-shift", "Tuna-and-bean or chicken wrap, fruit, yogurt, and water"],
        ["After shift", "Milk, cottage cheese, yogurt, banana, or a light egg/tofu meal; avoid a huge meal immediately before sleep"],
    ], [1.35*inch, 5.65*inch]))
    s.append(p("Weekly staples: oats, eggs, Greek yogurt, cottage cheese, milk, chicken thighs, canned tuna or salmon, tofu, lentils, beans, rice, potatoes, whole-wheat wraps, frozen vegetables, cabbage, carrots, onions, bananas, apples, and frozen berries. Health Canada recommends vegetables and fruit, whole grains, protein foods, water, and limiting highly processed foods."))

    s.append(rich("4. Home training: months 1-4", "H1x"))
    s.append(p("Train two days in month 1, then three days per week. Stop each set with about 2-3 controlled repetitions left. Add repetitions first, then backpack load, then a set."))
    s.append(make_table([
        ["Workout A", "Workout B"],
        ["Chair or body-weight squat: 2-4 x 8-15", "Step-up: 2-4 x 8-12/side"],
        ["Incline push-up: 2-4 x 6-15", "Push-up progression: 2-4 x 6-15"],
        ["Backpack row: 2-4 x 8-15", "One-arm backpack row: 2-4 x 8-15/side"],
        ["Backpack Romanian deadlift: 2-4 x 8-15", "Glute bridge: 2-4 x 10-20"],
        ["Reverse lunge: 2-3 x 6-12/side", "Pike push-up or backpack press: 2-3 x 6-12"],
        ["Dead bug and calf raise", "Side plank and wall slides"],
    ], [3.5*inch, 3.5*inch]))
    s.append(p("Cardio is mainly brisk walking at a pace where you can speak in short sentences. Use a 5-10 minute mobility routine daily: chin tucks, wall slides, thoracic extension, hip-flexor stretch, ankle mobility, and gentle hamstring work."))

    s.append(rich("5. Gym training: months 5-7", "H1x"))
    s.append(p("Use three full-body sessions, not an exhausting bodybuilding split. Begin with machines or light dumbbells while learning technique. Keep two moderate cardio sessions."))
    s.append(make_table([
        ["Session A", "Session B", "Session C"],
        ["Leg press or goblet squat", "Squat variation", "Hip thrust or trap-bar deadlift"],
        ["Bench or machine press", "Incline dumbbell press", "Chest-supported row"],
        ["Lat pulldown", "Seated cable row", "Leg press or step-up"],
        ["Romanian deadlift", "Split squat", "Leg curl"],
        ["Lateral raise; plank", "Shoulder press; curls/triceps", "Assisted pull-up; farmer carry"],
    ], [2.34*inch, 2.34*inch, 2.34*inch]))
    s.append(p("Most exercises can use 3 sets of 6-12 repetitions. Add weight only when all repetitions are controlled. If sleep is poor or your warehouse shift is extended, reduce sets rather than forcing a hard session."))

    s.append(rich("6. Tracking, plateaus, and safety", "H1x"))
    s.append(make_table([
        ["Frequency", "Record"],
        ["Daily", "Morning weight, calories, protein, sleep duration, energy 1-5"],
        ["Weekly", "Seven-day weight average, waist at navel, step average, strength sessions, cardio minutes"],
        ["Monthly", "Front/side/back photos, best repetitions or loads, clothing fit, sleep trend"],
    ], [1.1*inch, 5.9*inch]))
    s.append(numbered([
        "If the seven-day average has not moved for three weeks, check portions, liquid calories, weekend eating, and steps.",
        "Then add 1,500-2,000 steps per day or reduce approximately 150 kcal per day.",
        "If you are losing more than about 0.8-1.0 kg per week for two weeks, or you feel dizzy or weak, add 150-200 kcal and seek advice.",
        "Never use dehydration, laxatives, starvation, or a very-low-calorie diet without medical supervision.",
    ]))
    s.append(p("Seek medical help for chest pain, fainting, severe shortness of breath, repeated vomiting, severe weakness, black or bloody stool, or an injury that prevents normal movement. Ask a doctor about persistent insomnia, loud snoring, gasping, or severe daytime sleepiness."))

    s.append(rich("7. Night-shift recovery plan", "H1x"))
    s.append(bullets([
        "Protect a consistent sleep block. On the normal shift, a target such as 4:30 a.m. to 12:30 p.m. may work; on peak weeks move the block later rather than cutting it short.",
        "Use a dark, cool room, eye mask, earplugs or white noise, and a 20-30 minute wind-down.",
        "Avoid caffeine approximately eight hours before planned sleep and avoid a very heavy meal immediately before bed.",
        "If a shift ends at 4:30 a.m., do only light mobility or walking the next day and use Friday/Saturday for deeper study and training.",
    ]))

    s.append(rich("8. Minimum viable day", "H1x"))
    s.append(bullets([
        "Sleep for the planned block.", "Drink water and eat one protein-and-vegetable meal.",
        "Walk 10 minutes and do 5 minutes of mobility.", "Do 15 minutes of language review.",
        "Spend 10 minutes on IT or English, alternating days.", "Log weight, sleep, and energy."
    ]))
    s += sources([
        ("CDC, Steps for Losing Weight", "https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html"),
        ("Health Canada, Healthy Eating Recommendations", "https://www.canada.ca/en/health-canada/services/food-guide/explore/healthy-eating-recommendations.html"),
        ("Protein and resistance training meta-analysis", "https://pubmed.ncbi.nlm.nih.gov/28698222/"),
        ("Transport Canada, fatigue management for employees", "https://tc.canada.ca/en/aviation/commercial-air-services/fatigue-management-aviation/fatigue-risk-management-employees"),
    ])
    build_pdf(OUT / "goal_1_body_transformation.pdf", "Goal 1: Body Transformation", s)


def language_pdf():
    s = []
    s += cover(
        "Goal 2: French and English",
        "A seven-month language roadmap for CELPIP improvement and a serious French foundation",
        "English: CELPIP L8/R7/W7/S7 | French: complete beginner | PR objective | Night shift"
    )
    s.append(rich("<b>Outcome to pursue</b>: make English CLB 8-9 the realistic seven-month target, treat CLB 10 as a stretch, and build French from zero toward A2/early B1 with a longer-term route to NCLC 7-8.", "Callout"))
    s.append(p("Your 29 May 2025 CELPIP result should generally remain valid until 29 May 2027 because IRCC requires language results to be less than two years old when you create a profile and submit your PR application. Retesting in early 2027 gives you a fresh result."))

    s.append(rich("1. Feasibility and test targets", "H1x"))
    s.append(make_table([
        ["Goal", "Seven-month assessment", "Longer-term target"],
        ["English CLB 10", "Aggressive stretch from L8/R7/W7/S7", "Possible with targeted practice and retesting"],
        ["French NCLC 7", "Stretch from complete beginner; do not assume it", "Approximately 12-24+ months for a serious attempt"],
        ["French NCLC 8", "Unlikely in seven months from zero", "Pursue after NCLC 7 foundation and sustained practice"],
    ], [1.25*inch, 2.9*inch, 2.85*inch]))
    s.append(p("French NCLC 7 in all four abilities is required for the Express Entry French-language category. French can add up to 50 CRS points when English is at least CLB 5 in all four abilities, but French alone does not guarantee an invitation."))

    s.append(rich("2. Weekly study budget", "H1x"))
    s.append(make_table([
        ["Period", "French", "English", "Method"],
        ["Months 1-2", "8 hours", "4 hours", "Short daily sessions; one longer Friday/Saturday block"],
        ["Months 3-4", "9-10 hours", "5 hours", "Add timed tasks and weekly speaking feedback"],
        ["Months 5-7", "10-12 hours", "5-6 hours", "Test preparation; reduce on peak-shift weeks"],
    ], [1.15*inch, 0.9*inch, 0.9*inch, 4.05*inch]))
    s.append(p("The base plan is 12-18 language hours per week. During peak season, protect sleep and complete the minimum viable routine instead of studying through severe fatigue."))

    s.append(rich("3. French month-by-month progression", "H1x"))
    s.append(make_table([
        ["Month", "Target", "Required work"],
        ["1", "Pronunciation and A1", "Sounds, alphabet, greetings, numbers, gender, present tense, 300-500 words"],
        ["2", "Functional A1", "Questions, negation, common verbs, self-introduction, basic listening"],
        ["3", "A2 foundation", "Past and near future, routines, descriptions, 800-1,200 words"],
        ["4", "A2+", "Longer listening, simple opinions, short paragraphs, weekly conversation"],
        ["5", "Early B1", "Connectors, explanations, roleplays, 1,500-2,000 words"],
        ["6", "B1 test preparation", "Timed reading/listening, structured speaking and writing, full diagnostic"],
        ["7", "Test decision", "Take an official test only if two mocks justify the cost; otherwise continue"],
    ], [0.6*inch, 1.35*inch, 5.05*inch]))
    s.append(rich("French skill practice", "H2x"))
    s.append(bullets([
        "Listening: daily short audio, dictation twice weekly, then varied accents and timed multiple-choice practice.",
        "Speaking: shadow a model sentence, record a one-minute answer, and add a weekly roleplay from month 3.",
        "Reading: graded text first, then timed articles, connectors, inference, and scanning for details.",
        "Writing: begin with messages and descriptions, then structured opinion paragraphs and correction logs.",
        "Vocabulary and grammar: Anki or another spaced-repetition system; learn phrases and examples, not isolated translations only.",
    ]))

    s.append(rich("4. English/CELPIP plan", "H1x"))
    s.append(make_table([
        ["Month", "English target", "Practice"],
        ["1", "Diagnose every skill", "Official sample test; grammar, pronunciation, sentence structure"],
        ["2", "Reliable CLB 8 tasks", "Two listening/reading sets; one corrected writing task weekly"],
        ["3", "Timed performance", "Two speaking recordings and one email/survey response weekly"],
        ["4", "Full mock", "Identify the lowest ability and use a four-week repair plan"],
        ["5", "First official attempt", "Book January 2027 only if mocks are consistently strong"],
        ["6", "Remediation", "Two full mocks; focus on the weakest section"],
        ["7", "Retake buffer", "Retake around March 2027 if needed; keep results fresh"],
    ], [0.6*inch, 1.5*inch, 4.9*inch]))
    s.append(rich("CELPIP skill routines", "H2x"))
    s.append(bullets([
        "Listening: predict the answer, note names/numbers/opinions, and practise once-through audio without pausing.",
        "Reading: skim purpose and structure, mark evidence, and maintain a workplace vocabulary list.",
        "Writing: write one email and one survey response weekly; use purpose, details, requested action, and closing.",
        "Speaking: record two prompts weekly using position, reason, example, and conclusion; explain technical problems to a nontechnical customer.",
    ]))

    s.append(rich("5. TEF Canada or TCF Canada", "H1x"))
    s.append(p("Both tests are accepted by IRCC. Neither automatically gives a PR advantage. Choose by test-centre availability, total price, computer or paper preference, and which official practice format produces the better score. Commit to one by month 2 or 3."))
    s.append(make_table([
        ["Level", "TEF speaking", "TEF listening", "TEF reading", "TEF writing", "TCF speaking", "TCF listening", "TCF reading", "TCF writing"],
        ["NCLC 7", "310-348", "249-279", "207-232", "310-348", "10-11", "458-502", "453-498", "10-11"],
        ["NCLC 8", "349-370", "280-297", "233-247", "349-370", "12-13", "503-522", "499-523", "12-13"],
    ], [0.65*inch, 0.82*inch, 0.82*inch, 0.82*inch, 0.82*inch, 0.82*inch, 0.82*inch, 0.82*inch, 0.82*inch]))
    s.append(p("For TEF, use the score column and equivalency instructions specified by IRCC. Do not enter an incompatible raw-score column in an Express Entry profile."))

    s.append(rich("6. Low-cost resources", "H1x"))
    s.append(make_table([
        ["Area", "Start with", "Optional paid support"],
        ["French foundation", "TV5MONDE Premiere classe, RFI Francais facile, Mauril, Anki, structured beginner videos", "Used grammar books; one tutor session weekly from month 3"],
        ["English", "CELPIP official samples, library, CBC audio, Write & Improve, recorded answers", "One speaking/writing review session before each official test"],
        ["Conversation", "Alliance Francaise groups, community events, language exchanges", "iTalki or Preply 30-minute session"],
        ["Mock exams", "Official CELPIP and TEF/TCF sample tests", "Do not pay for an exam until practice performance is stable"],
    ], [1.05*inch, 3.2*inch, 2.75*inch]))

    s.append(rich("7. Tracking system", "H1x"))
    s.append(p("Use one spreadsheet with date, minutes, skill, resource, new vocabulary, error, corrected version, review date, mock score, and next action."))
    s.append(make_table([
        ["Weekly minimum", "Target"],
        ["French", "8-12 hours, one speaking session, one writing task, vocabulary review six days"],
        ["English", "4-6 hours, two speaking recordings, one corrected writing task, one timed set"],
        ["Monthly", "One diagnostic; retain a list of the three highest-impact errors"],
    ], [1.45*inch, 5.55*inch]))
    s.append(rich("8. Minimum viable language day", "H1x"))
    s.append(bullets([
        "French Anki or review for 10 minutes.", "Listen to French for 10 minutes while following a transcript.",
        "Answer one English speaking prompt or edit three sentences.", "Write down one error and its corrected form."
    ]))
    s += sources([
        ("IRCC, Express Entry language tests and conversions", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html"),
        ("IRCC, French-language proficiency category", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations/category-based-selection.html"),
        ("IRCC, CRS criteria and French bonus", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html"),
    ])
    build_pdf(OUT / "goal_2_language_learning_plan.pdf", "Goal 2: French and English", s)


def it_pdf():
    s = []
    s += cover(
        "Goal 3: IT Support, Certifications, and PR",
        "A job-first plan for moving from material handling into genuine skilled technical support",
        "Age 23 | Single | No foreign experience | Two-year Canadian Computer Programming diploma | PGWP to 20 Jan 2029"
    )
    s.append(rich("<b>Primary outcome</b>: secure genuine TEER 2 IT support work, document it accurately, and use English, French, education, and Canadian skilled experience to build a realistic PR pathway.", "Callout"))
    s.append(p("A job title does not decide immigration eligibility. Actual duties, employer documentation, paid authorized work, hours, location, and the requirements of the specific program decide it."))

    s.append(rich("1. Your approximate CRS starting point", "H1x"))
    s.append(p("Using your age 23, no spouse, two-year Canadian diploma, no foreign skilled work, no French result, and no qualifying skilled Canadian work, your approximate CRS is about 310 with CELPIP 8/7/7/7. This assumes no sibling in Canada, no second credential, and no additional factors."))
    s.append(make_table([
        ["Scenario", "Approximate CRS"],
        ["Current English 8/7/7/7; no French; no skilled Canadian work", "310"],
        ["CLB 9 in all English abilities", "372"],
        ["CLB 10 in all English abilities", "384"],
        ["CLB 9 English plus NCLC 7 French", "434"],
        ["CLB 10 English plus NCLC 7 French", "446"],
        ["CLB 9 + NCLC 7 French + one year skilled Canadian work", "Approximately 487"],
        ["CLB 10 + NCLC 7 French + one year skilled Canadian work", "Approximately 499"],
    ], [5.65*inch, 1.35*inch]))
    s.append(p("These are planning estimates, not an invitation prediction. Current CRS rules no longer award Express Entry points for a job offer, although a job offer can still matter for eligibility in some programs."))

    s.append(rich("2. NOC and role strategy", "H1x"))
    s.append(make_table([
        ["Role", "NOC/TEER", "What must be true", "Priority"],
        ["Help desk technician, service desk analyst, user support technician", "22221 / TEER 2", "First-line hardware/software troubleshooting, diagnosis, user support, ticket documentation", "Highest"],
        ["Computer help desk representative, systems support representative", "22221 / TEER 2", "Technical problem-solving and business-system/network support, not only account service", "Highest"],
        ["Technical support analyst/representative; hardware/software support", "22221 / TEER 2", "Reproduce, diagnose, resolve, document technical problems", "High"],
        ["Computer network technician or network support analyst", "22220 / TEER 2", "LAN/WAN maintenance, connectivity, installation, backup/security support", "Medium"],
        ["Information systems testing technician", "22222 / TEER 2", "Execute test plans, scripts, and application/system evaluation", "Adjacent"],
        ["Information systems specialist or technical support engineer", "21222 / TEER 1", "Systems analysis, requirements, implementation, and advice", "Later"],
        ["Technical support supervisor", "22221 / TEER 2", "Actually supervise technical support workers; experience normally expected", "Future"],
        ["Customer service technical representative", "64409 / TEER 4 if mostly accounts/billing", "General enquiries, orders, accounts, complaints, payments", "Use caution"],
        ["Current material handler", "75101 / TEER 5", "Move, load, unload, and handle materials", "Income bridge, not CEC skilled work"],
    ], [1.55*inch, 1.0*inch, 3.35*inch, 1.1*inch]))
    s.append(p("NOC 22221 is officially TEER 2 and commonly requires a college program in computer science, computer programming, or network administration. Your diploma aligns with that typical education requirement. NOC 64409 is TEER 4, and NOC 75101 material handlers are TEER 5."))

    s.append(rich("3. Certifications: the correct order", "H1x"))
    s.append(rich("Certification priority", "H2x"))
    s.append(make_table([
        ["Order", "Credential or training", "Why it belongs here", "Timing"],
        ["1", "Free foundations: Microsoft Learn, Cisco Networking Academy, Professor Messer", "Build Windows, Linux, networking, troubleshooting, and PowerShell basics without spending money", "Start now"],
        ["2", "Google IT Support Certificate, only if inexpensive or financial aid is available", "Structured beginner curriculum; useful for discipline, but not a substitute for hands-on evidence", "Months 1-2"],
        ["3", "CompTIA A+ (Core 1 and Core 2)", "Most directly aligned with entry-level hardware/help-desk roles; buy vouchers only after strong practice scores", "Study months 2-5"],
        ["4", "Microsoft Learn and optional SC-900", "Useful Microsoft 365, Entra ID, identity, and security foundation if target postings request it", "Months 5-7"],
        ["5", "CompTIA Network+", "Useful for network-support roles after A+ and troubleshooting basics", "After A+ or first job"],
        ["6", "CompTIA Security+", "Useful for a deliberate security path, not required for first-line help desk", "Later"],
        ["7", "ITIL Foundation", "Take only if several target employers explicitly request it", "Only when justified"],
    ], [0.55*inch, 1.8*inch, 3.65*inch, 1.0*inch]))
    s.append(rich("Do not do this", "H2x"))
    s.append(bullets([
        "Do not buy A+, Network+, Security+, ITIL, and multiple bootcamps at once.",
        "Do not pay for an A+ exam voucher until practice scores are consistently strong and your budget can absorb a retake.",
        "Do not claim that a course is work experience or that a home lab is a production job.",
        "Do not misrepresent a job title or ask an employer to invent duties."
    ]))

    s.append(rich("4. Home lab and portfolio", "H1x"))
    s.append(make_table([
        ["Project", "Build", "Evidence to publish"],
        ["1. Help-desk environment", "Windows and Ubuntu VMs, Windows Server evaluation if available, Active Directory users/groups, password reset, onboarding/offboarding, ticketing with osTicket", "Architecture diagram, screenshots, sample tickets, knowledge-base articles, troubleshooting decision tree"],
        ["2. Network troubleshooting", "Packet Tracer LAN with IP addressing, DHCP, DNS, VLANs, Wireshark capture, simulated outage", "Ticket, symptoms, isolation steps, root cause, fix, verification, escalation notes"],
        ["3. PowerShell support automation", "Inventory script, local-user and installed-software report, disk/service checks, event-log collection, safe support report", "Code, test cases, output samples, security notes, limitations, no secrets"],
    ], [1.35*inch, 3.25*inch, 2.4*inch]))
    s.append(p("Every GitHub project should contain a README, objective, user problem, architecture, prerequisites, setup steps, screenshots with secrets removed, sample tickets, tests, security considerations, limitations, lessons learned, and future improvements."))

    s.append(rich("5. Resume, LinkedIn, and interviews", "H1x"))
    s.append(bullets([
        "Resume headline: Computer Programming diploma graduate transitioning into IT support, with hands-on Windows, Linux, networking, PowerShell, ticketing, and troubleshooting labs.",
        "Use truthful GEODIS evidence: reliability on overnight shifts, safety, high-volume accuracy, learning scanners or warehouse systems, prioritization, and teamwork.",
        "Omit the 2.5 GPA unless specifically requested. Put projects above unrelated detail once they are working and documented.",
        "LinkedIn headline: Computer Programming Diploma | IT Support / Help Desk | Windows, Networking, PowerShell Home Lab.",
        "Prepare STAR stories about solving a process problem, learning quickly, preventing a safety issue, handling a difficult interaction, prioritizing under pressure, and recovering from a failed lab fix.",
        "Use the troubleshooting sequence: clarify, reproduce, isolate, fix, verify with the user, document, and escalate with evidence."
    ]))

    s.append(rich("6. Job-search operating system", "H1x"))
    s.append(make_table([
        ["Period", "Applications", "Networking", "Other"],
        ["Months 1-2", "5-8 targeted/week", "3 conversations/month", "Ask GEODIS about WMS, application-support, and IT openings"],
        ["Months 3-7", "10-15 targeted/week", "3 conversations/week; 5 recruiter contacts/week", "2 mock interviews/month; improve resume from response data"],
        ["Peak-shift weeks", "5-8 quality applications/week", "One or two short contacts", "Protect sleep; use Friday/Saturday deep work"],
    ], [1.15*inch, 1.45*inch, 1.75*inch, 2.65*inch]))
    s.append(p("Search terms: help desk technician, service desk analyst, IT support technician, desktop support, user support technician, technical support analyst, technical support representative, computer technician, application support, field service technician, WMS support, network support technician, and junior systems support."))

    s.append(rich("7. Offer and NOC verification checklist", "H1x"))
    s.append(numbered([
        "Get the written job description, legal employer name, work location, wage, hours, start date, and permanent or temporary status.",
        "Compare the lead statement and most main duties with the official NOC page.",
        "Confirm that the role is genuinely technical, not mostly billing, account updates, or general customer service.",
        "Ask whether the employer will provide a reference letter listing title, dates, wage, hours, and actual duties.",
        "Keep contracts, schedules, paystubs, tax documents, and supervisor contact details.",
        "Only use a NOC that honestly matches what you performed."
    ]))

    s.append(rich("8. PR timeline and pathway", "H1x"))
    s.append(bullets([
        "Primary federal plan: Canadian Experience Class after 1,560 hours of paid, authorized TEER 0-3 Canadian work, normally one year at 30 hours per week.",
        "For a genuine TEER 2 IT role, the CEC minimum language level is CLB 5 in all four English abilities or NCLC 5 in all four French abilities. Higher English and French scores improve CRS.",
        "French-language Express Entry requires NCLC 7 in all four French abilities and eligibility for an Express Entry program; ranking still controls invitations.",
        "Ontario changed its program in 2026. Previous streams were closed and a new Workforce Priority structure was introduced. Check the current official page before relying on Ontario.",
        "Atlantic or community pilots may be relevant after you have a designated-employer offer and meet the particular work, language, education, and settlement rules.",
        "Moving provinces alone does not create eligibility. Move only after verifying a live program, an eligible job, and your genuine intention to settle there."
    ]))
    s.append(p("If you start a qualifying IT job by March-June 2027, you could potentially complete one year of skilled Canadian work by March-June 2028, leaving useful time before your PGWP expiry on 20 January 2029."))

    s.append(rich("9. Seven-month IT milestones", "H1x"))
    s.append(make_table([
        ["Month", "Milestone"],
        ["1", "Free fundamentals, resume/LinkedIn, GitHub, lab setup, GEODIS internal inquiry"],
        ["2", "Project 1 working, 5-8 applications/week, finish or progress Google IT Support"],
        ["3", "Project 1 documented, Project 2 started, A+ preparation, first mock interview"],
        ["4", "Project 2 complete, apply broadly to NOC 22221 roles, attempt A+ Core 1 only if ready"],
        ["5", "Project 3, 12-15 applications/week, interview practice, optional Microsoft fundamentals"],
        ["6", "All projects polished, CRS estimate updated, 2 mock interviews, wider geographic search"],
        ["7", "Written-offer target, evidence system ready, decide whether to take A+ Core 2 or defer for budget"],
    ], [0.65*inch, 6.35*inch]))

    s.append(rich("10. Minimum viable IT day", "H1x"))
    s.append(bullets([
        "Watch or read one 15-minute fundamentals lesson.", "Make one GitHub commit or write one troubleshooting note.",
        "Send one targeted application or networking message.", "Review one English technical explanation aloud."
    ]))
    s += sources([
        ("NOC 22221, User support technicians", "https://noc.esdc.gc.ca/Structure/NOCProfile?code=22221&version=2021.0"),
        ("NOC 22220, Computer network and web technicians", "https://noc.esdc.gc.ca/Structure/NOCProfile?code=22220&version=2021.0"),
        ("NOC 22222, Information systems testing technicians", "https://noc.esdc.gc.ca/Structure/NOCProfile?code=22222&version=2021.0"),
        ("NOC 64409, Other customer and information services representatives", "https://noc.esdc.gc.ca/Structure/NOCProfile?code=64409&version=2021.0"),
        ("NOC 75101, Material handlers", "https://noc.esdc.gc.ca/Structure/NOCProfile?code=75101&version=2021.0"),
        ("IRCC, Canadian Experience Class", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply/canadian-experience-class.html"),
        ("IRCC, CRS criteria", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html"),
        ("Ontario OINP 2026 program update", "https://www.ontario.ca/page/2026-ontario-immigrant-nominee-program-updates"),
        ("Microsoft Learn", "https://learn.microsoft.com/training/"),
        ("CompTIA A+", "https://www.comptia.org/certifications/a"),
    ])
    build_pdf(OUT / "goal_3_it_support_pr_and_certifications.pdf", "Goal 3: IT Support, Certifications, and PR", s)


if __name__ == "__main__":
    body_pdf()
    language_pdf()
    it_pdf()
    print("Created PDFs in", OUT.resolve())
