##### \# FINVERSE — NEW UI/UX + REAL-TIME TRANSACTION EXPERIENCE + INTELLIGENT FINANCIAL SYSTEM DESIGN

##### 

##### The next priority is to redesign FINVERSE into a \*\*modern, fast, user-friendly financial application\*\*.

##### 

##### Do not only improve the appearance.

##### 

##### The UI, transaction pipeline, analytics engine, synchronization architecture, and user interactions must be redesigned together so the application feels fast, reliable, intelligent, and easy to understand.

##### 

##### This must work consistently on:

##### 

##### \* Android

##### \* iOS

##### 

##### The target experience should feel comparable in polish and responsiveness to modern financial apps, while maintaining FINVERSE's own identity.

##### 

##### \---

##### 

##### \# 1. PRIMARY OBJECTIVE

##### 

##### Create a FINVERSE experience where a user can open the app and immediately understand:

##### 

##### \* how much money they have;

##### \* how much they earned;

##### \* how much they spent;

##### \* where the money went;

##### \* what bills are coming;

##### \* how their spending compares with previous periods;

##### \* whether their financial position is improving or declining;

##### \* which transactions need attention;

##### \* what actions they may want to consider.

##### 

##### The application should turn thousands of transactions into a simple financial picture.

##### 

##### The system must be:

##### 

##### \*\*FAST + CLEAN + INTELLIGENT + EXPLAINABLE + SECURE\*\*

##### 

##### \---

##### 

##### \# 2. REDESIGN THE ENTIRE MOBILE UI

##### 

##### Audit the existing Flutter UI.

##### 

##### Do not keep poor existing layouts merely because they already work.

##### 

##### Create a coherent FINVERSE design system.

##### 

##### Implement consistent:

##### 

##### \* spacing;

##### \* typography;

##### \* buttons;

##### \* cards;

##### \* icons;

##### \* input fields;

##### \* charts;

##### \* colors;

##### \* navigation;

##### \* loading indicators;

##### \* error states;

##### \* empty states;

##### \* bottom sheets;

##### \* dialogs;

##### \* transaction rows;

##### \* account cards;

##### \* financial metric cards.

##### 

##### Avoid excessive decoration.

##### 

##### The app should feel professional and financial, not like a development dashboard.

##### 

##### \---

##### 

##### \# 3. MAIN NAVIGATION

##### 

##### Create a simple bottom navigation structure such as:

##### 

##### \### Home

##### 

##### Financial overview.

##### 

##### \### Transactions

##### 

##### All money movement.

##### 

##### \### Analytics

##### 

##### Deep financial analysis.

##### 

##### \### Accounts

##### 

##### Banks, cards and connected accounts.

##### 

##### \### Profile

##### 

##### Security, privacy and settings.

##### 

##### Keep primary navigation simple.

##### 

##### Do not create ten main tabs.

##### 

##### Secondary features should live inside appropriate sections.

##### 

##### \---

##### 

##### \# 4. NEW HOME DASHBOARD

##### 

##### The home screen should answer:

##### 

##### \*\*“What is happening with my money right now?”\*\*

##### 

##### At the top show a consolidated financial overview.

##### 

##### Examples:

##### 

##### \### Total Available Balance

##### 

##### Aggregate eligible connected cash accounts.

##### 

##### \### Income This Month

##### 

##### Current income.

##### 

##### \### Spending This Month

##### 

##### Current expenses.

##### 

##### \### Net Cash Flow

##### 

##### Income minus expenses.

##### 

##### \### Savings This Month

##### 

##### Calculated savings.

##### 

##### Show comparison where sufficient historical data exists.

##### 

##### Examples:

##### 

##### `12% less spending than last month`

##### 

##### `8% higher income`

##### 

##### `$320 more saved`

##### 

##### Do not show comparisons if insufficient data exists.

##### 

##### \---

##### 

##### \# 5. DASHBOARD QUICK INSIGHTS

##### 

##### Below the main metrics show intelligent cards such as:

##### 

##### \### Spending Trend

##### 

##### “You have spent $1,420 so far this month.”

##### 

##### \### Budget Status

##### 

##### “Groceries are at 72% of your monthly budget.”

##### 

##### \### Upcoming Bills

##### 

##### “3 recurring payments totaling $186 are expected this week.”

##### 

##### \### Cash Flow

##### 

##### “At your current spending rate, your estimated month-end balance is $2,340.”

##### 

##### \### Subscription Change

##### 

##### “Netflix increased by $3 this month.”

##### 

##### \### Unusual Spending

##### 

##### “Restaurant spending is significantly higher than your normal pattern.”

##### 

##### Every insight must have an explanation.

##### 

##### Never generate random AI statements.

##### 

##### \---

##### 

##### \# 6. SMOOTH TRANSACTION FEED

##### 

##### The Transactions screen is one of the most important parts of FINVERSE.

##### 

##### It must feel extremely responsive.

##### 

##### Create a fast scrolling feed similar to modern banking applications.

##### 

##### Each row should clearly show:

##### 

##### \* merchant;

##### \* merchant/category icon;

##### \* account;

##### \* amount;

##### \* date/time;

##### \* category;

##### \* pending/posted status.

##### 

##### Income should be visually distinguishable from expenses without using confusing designs.

##### 

##### Transactions should be grouped intelligently.

##### 

##### Example:

##### 

##### \### Today

##### 

##### Uber — $23.40

##### 

##### Walmart — $82.17

##### 

##### Payroll +$1,850

##### 

##### \### Yesterday

##### 

##### Netflix — $18.99

##### 

##### Shell — $61.40

##### 

##### \---

##### 

##### \# 7. TRANSACTION DETAILS

##### 

##### Tapping a transaction should open a detailed view.

##### 

##### Show:

##### 

##### \* merchant;

##### \* amount;

##### \* date;

##### \* account;

##### \* category;

##### \* pending/posted;

##### \* original description;

##### \* recurring status;

##### \* transaction type;

##### \* notes;

##### \* related receipt if available.

##### 

##### Allow:

##### 

##### \* change category;

##### \* rename merchant locally;

##### \* mark as transfer;

##### \* mark as recurring;

##### \* exclude/include in analytics where justified;

##### \* add note;

##### \* report possible duplicate;

##### \* attach receipt.

##### 

##### User changes must persist.

##### 

##### \---

##### 

##### \# 8. FAST TRANSACTION SEARCH

##### 

##### Create intelligent search.

##### 

##### The user should be able to search:

##### 

##### `McDonald's`

##### 

##### `Uber`

##### 

##### `$100`

##### 

##### `Groceries`

##### 

##### `July`

##### 

##### `TD`

##### 

##### Search should support:

##### 

##### \* merchant;

##### \* amount;

##### \* category;

##### \* bank;

##### \* account;

##### \* transaction description;

##### \* notes;

##### \* date range.

##### 

##### Use debouncing so search feels responsive without spamming the backend.

##### 

##### \---

##### 

##### \# 9. ADVANCED FILTERS

##### 

##### Allow filtering by:

##### 

##### \* date;

##### \* category;

##### \* account;

##### \* merchant;

##### \* income;

##### \* expense;

##### \* transfer;

##### \* pending;

##### \* posted;

##### \* recurring;

##### \* amount range.

##### 

##### Filters should be simple enough for normal users.

##### 

##### Use a bottom sheet or compact filter panel.

##### 

##### \---

##### 

##### \# 10. SMOOTH TRANSACTION SYNC

##### 

##### Design the transaction synchronization system so users see new transactions quickly.

##### 

##### Architecture:

##### 

##### \*\*Bank Provider\*\*

##### 

##### → Webhook / Provider Update

##### 

##### → FINVERSE Sync Worker

##### 

##### → Transaction Normalizer

##### 

##### → Deduplication

##### 

##### → Categorization

##### 

##### → Analytics Update

##### 

##### → Database

##### 

##### → Mobile API

##### 

##### → Mobile UI Refresh

##### 

##### Do not make the user manually refresh constantly.

##### 

##### \---

##### 

##### \# 11. BACKGROUND SYNCHRONIZATION

##### 

##### Where provider and infrastructure allow it:

##### 

##### \* process bank webhooks;

##### \* schedule periodic sync;

##### \* use incremental cursors;

##### \* detect stale connections;

##### \* retry failed synchronization;

##### \* prevent duplicate processing.

##### 

##### The mobile app should request the latest server state when opened or resumed.

##### 

##### Do not continuously poll unnecessarily.

##### 

##### \---

##### 

##### \# 12. PULL TO REFRESH

##### 

##### Still provide:

##### 

##### \*\*Pull to refresh\*\*

##### 

##### When triggered:

##### 

##### 1\. request synchronization;

##### 2\. show subtle progress state;

##### 3\. update transactions;

##### 4\. update balances;

##### 5\. update analytics;

##### 6\. show last-sync timestamp.

##### 

##### Example:

##### 

##### `Updated 14 seconds ago`

##### 

##### \---

##### 

##### \# 13. OPTIMISTIC UI

##### 

##### For safe user actions such as:

##### 

##### \* transaction category change;

##### \* note update;

##### \* transaction tagging;

##### \* account display name;

##### 

##### use optimistic UI where appropriate.

##### 

##### The interface should update immediately.

##### 

##### If the server fails, revert safely and inform the user.

##### 

##### Do not use optimistic UI for sensitive operations such as bank disconnection without server confirmation.

##### 

##### \---

##### 

##### \# 14. PAGINATION

##### 

##### Do not download the user's entire financial history every time the Transactions screen opens.

##### 

##### Implement efficient pagination/cursor loading.

##### 

##### Example:

##### 

##### \* initial 50 transactions;

##### \* load more as user scrolls;

##### \* preserve scroll state;

##### \* cache recent transactions securely.

##### 

##### Ensure filters and search still work correctly.

##### 

##### \---

##### 

##### \# 15. TRANSACTION NORMALIZATION ENGINE

##### 

##### Providers will return inconsistent merchant and transaction descriptions.

##### 

##### Build a normalization engine.

##### 

##### Example:

##### 

##### Provider description:

##### 

##### `SQ \*COFFEE SHOP 829137 ON`

##### 

##### Display:

##### 

##### `Coffee Shop`

##### 

##### Store both:

##### 

##### \* raw provider description;

##### \* normalized merchant name.

##### 

##### Normalization may include:

##### 

##### \* whitespace cleanup;

##### \* payment processor removal;

##### \* store number removal;

##### \* capitalization normalization;

##### \* merchant aliases.

##### 

##### Never destroy the original provider data.

##### 

##### \---

##### 

##### \# 16. INTELLIGENT CATEGORIZATION ENGINE

##### 

##### Build a layered categorization system.

##### 

##### Priority:

##### 

##### \### Level 1 — User Rules

##### 

##### User corrections take priority.

##### 

##### \### Level 2 — Merchant Rules

##### 

##### Known merchant/category relationships.

##### 

##### \### Level 3 — Provider Category

##### 

##### Use provider metadata.

##### 

##### \### Level 4 — Pattern Classification

##### 

##### Use transaction description and historical behavior.

##### 

##### \### Level 5 — Fallback

##### 

##### Other/Uncategorized.

##### 

##### Never make LLM classification the only categorization method.

##### 

##### \---

##### 

##### \# 17. SELF-LEARNING USER RULES

##### 

##### If a user changes:

##### 

##### `Costco`

##### 

##### to:

##### 

##### `Groceries`

##### 

##### multiple times, FINVERSE should offer:

##### 

##### \*\*Always categorize Costco as Groceries?\*\*

##### 

##### If accepted, create a user categorization rule.

##### 

##### Support:

##### 

##### \* exact merchant rule;

##### \* description contains rule;

##### \* account-specific rule where useful.

##### 

##### Allow the user to manage/delete rules.

##### 

##### \---

##### 

##### \# 18. INTERNAL TRANSFER DETECTION

##### 

##### Build an intelligent transfer matching engine.

##### 

##### Example:

##### 

##### TD Chequing:

##### 

##### `-$1,000`

##### 

##### TD Savings:

##### 

##### `+$1,000`

##### 

##### Same/similar date.

##### 

##### These should likely be treated as one internal transfer.

##### 

##### Use:

##### 

##### \* amount;

##### \* timestamp;

##### \* account ownership;

##### \* provider transfer metadata;

##### \* descriptions;

##### \* known linked accounts.

##### 

##### Assign a confidence score.

##### 

##### For uncertain cases show:

##### 

##### \*\*Possible transfer\*\*

##### 

##### and allow user confirmation.

##### 

##### Transfers should not inflate income or expenses.

##### 

##### \---

##### 

##### \# 19. REFUND MATCHING

##### 

##### Detect likely refunds.

##### 

##### Example:

##### 

##### Walmart purchase:

##### 

##### `-$84.25`

##### 

##### Later:

##### 

##### `+$84.25`

##### 

##### Attempt to associate the refund with the original transaction.

##### 

##### Refunds should be handled correctly in spending analytics.

##### 

##### \---

##### 

##### \# 20. DUPLICATE DETECTION

##### 

##### Detect duplicates using:

##### 

##### \* provider transaction IDs;

##### \* amount;

##### \* merchant;

##### \* timestamps;

##### \* account;

##### \* pending/posted lifecycle;

##### \* provider metadata.

##### 

##### Never blindly remove transactions solely because two amounts match.

##### 

##### Create confidence-based detection.

##### 

##### \---

##### 

##### \# 21. RECURRING TRANSACTION ENGINE

##### 

##### Analyze history for recurring transactions.

##### 

##### Detect patterns:

##### 

##### \* weekly;

##### \* biweekly;

##### \* monthly;

##### \* quarterly;

##### \* yearly.

##### 

##### Examples:

##### 

##### \* salary;

##### \* rent;

##### \* Netflix;

##### \* insurance;

##### \* phone;

##### \* internet;

##### \* gym;

##### \* loan payment.

##### 

##### Calculate:

##### 

##### \* average amount;

##### \* expected next date;

##### \* interval;

##### \* confidence;

##### \* amount variance.

##### 

##### \---

##### 

##### \# 22. EXPENSE ANALYTICS ENGINE

##### 

##### Build a dedicated analytics module.

##### 

##### For a selected date range calculate:

##### 

##### \* gross expenses;

##### \* net expenses;

##### \* expense count;

##### \* average expense;

##### \* median expense;

##### \* largest expense;

##### \* spending by category;

##### \* spending by merchant;

##### \* spending by account;

##### \* recurring spending;

##### \* discretionary spending;

##### \* essential spending.

##### 

##### Keep calculations server-side/domain-layer where possible.

##### 

##### The Flutter UI should display analytics, not implement complex financial formulas.

##### 

##### \---

##### 

##### \# 23. INCOME ANALYTICS ENGINE

##### 

##### Calculate:

##### 

##### \* total income;

##### \* recurring income;

##### \* irregular income;

##### \* income by source;

##### \* average monthly income;

##### \* income trend;

##### \* largest income source;

##### \* expected upcoming income.

##### 

##### Avoid counting:

##### 

##### \* internal transfers;

##### \* refunds;

##### \* credit card payments;

##### 

##### as income unless specifically classified otherwise.

##### 

##### \---

##### 

##### \# 24. SAVINGS ENGINE

##### 

##### Calculate useful savings metrics.

##### 

##### At minimum:

##### 

##### `Net Savings = Eligible Income - Eligible Expenses`

##### 

##### Also calculate:

##### 

##### \* savings rate;

##### \* average monthly savings;

##### \* savings trend.

##### 

##### Clearly document the formula.

##### 

##### Allow unusual transactions to be excluded where appropriate.

##### 

##### \---

##### 

##### \# 25. SPENDING VELOCITY

##### 

##### Create a spending velocity metric.

##### 

##### Example:

##### 

##### Current monthly spending:

##### 

##### `$1,600`

##### 

##### Expected spending based on current pace:

##### 

##### `$2,730`

##### 

##### Compare with historical averages.

##### 

##### Show insights like:

##### 

##### `You are currently spending 14% faster than your 3-month average.`

##### 

##### Only show when enough history exists.

##### 

##### \---

##### 

##### \# 26. FINANCIAL TIMELINE

##### 

##### Create an optional timeline view showing:

##### 

##### \* income;

##### \* bills;

##### \* major purchases;

##### \* subscriptions;

##### \* transfers;

##### \* unusual transactions.

##### 

##### This helps users understand why balances changed.

##### 

##### \---

##### 

##### \# 27. ANALYTICS SCREEN

##### 

##### Create a dedicated Analytics section.

##### 

##### Possible sections:

##### 

##### \### Spending

##### 

##### Categories and merchants.

##### 

##### \### Income

##### 

##### Sources and trends.

##### 

##### \### Cash Flow

##### 

##### Income vs expenses.

##### 

##### \### Trends

##### 

##### Month-over-month.

##### 

##### \### Recurring

##### 

##### Subscriptions and recurring bills.

##### 

##### \### Accounts

##### 

##### Financial activity per account.

##### 

##### Allow period selection:

##### 

##### \* week;

##### \* month;

##### \* 3 months;

##### \* 6 months;

##### \* year;

##### \* custom.

##### 

##### \---

##### 

##### \# 28. CHART QUALITY

##### 

##### Charts must remain simple and readable.

##### 

##### Use appropriate charts such as:

##### 

##### \* line charts for trends;

##### \* bar charts for comparisons;

##### \* donut/pie sparingly for category composition;

##### \* progress bars for budgets.

##### 

##### Do not use complicated visualizations merely because they look impressive.

##### 

##### Every chart should answer a clear financial question.

##### 

##### \---

##### 

##### \# 29. INTELLIGENT INSIGHT ENGINE

##### 

##### Create an explainable insight engine based on deterministic financial analytics.

##### 

##### Examples:

##### 

##### \### Spending Increase

##### 

##### “Your restaurant spending increased from $240 last month to $380 this month.”

##### 

##### \### New Recurring Charge

##### 

##### “A new recurring charge of approximately $12.99/month was detected.”

##### 

##### \### Income Change

##### 

##### “Your income this month is 8% lower than your 3-month average.”

##### 

##### \### Cash Risk

##### 

##### “Based on scheduled expenses, your available cash may drop below $500 around August 24.”

##### 

##### \### Subscription Increase

##### 

##### “Spotify increased from $10.99 to $12.99.”

##### 

##### Insights must contain supporting values.

##### 

##### \---

##### 

##### \# 30. INSIGHT PRIORITY ENGINE

##### 

##### Do not show 30 insights simultaneously.

##### 

##### Assign each potential insight a priority based on:

##### 

##### \* financial impact;

##### \* urgency;

##### \* confidence;

##### \* abnormality;

##### \* user preferences.

##### 

##### Surface only the most useful insights.

##### 

##### Examples of priority:

##### 

##### \*\*Critical\*\*

##### 

##### Potentially insufficient funds.

##### 

##### \*\*Important\*\*

##### 

##### Unexpected large expense.

##### 

##### \*\*Informational\*\*

##### 

##### Spending decreased compared with last month.

##### 

##### \---

##### 

##### \# 31. FUTURE AI LAYER

##### 

##### Design the system so an AI assistant can later query structured FINVERSE analytics.

##### 

##### However:

##### 

##### AI must \*\*not\*\* be responsible for basic calculations.

##### 

##### Correct architecture:

##### 

##### \*\*Transactions\*\*

##### 

##### → deterministic analytics engine

##### 

##### → structured financial facts

##### 

##### → optional AI explanation layer.

##### 

##### Example structured output:

##### 

##### `restaurant\_spending\_current = 380`

##### 

##### `restaurant\_spending\_previous = 240`

##### 

##### `change\_percent = 58.3`

##### 

##### Then AI may explain:

##### 

##### “Restaurant spending increased significantly this month.”

##### 

##### This prevents hallucinated numbers.

##### 

##### \---

##### 

##### \# 32. USER FRIENDLY LANGUAGE

##### 

##### Avoid financial jargon where unnecessary.

##### 

##### Instead of:

##### 

##### `Aggregate discretionary expenditure variance`

##### 

##### show:

##### 

##### `You spent $120 more on non-essential purchases this month.`

##### 

##### Where financial terminology is useful, explain it.

##### 

##### \---

##### 

##### \# 33. LOADING EXPERIENCE

##### 

##### Do not show blank screens.

##### 

##### Use:

##### 

##### \* skeleton loaders;

##### \* subtle progress indicators;

##### \* cached data;

##### \* stale-data indicator.

##### 

##### Example:

##### 

##### Show cached dashboard immediately.

##### 

##### Then:

##### 

##### `Updating your latest transactions…`

##### 

##### Update components without rebuilding the entire page unnecessarily.

##### 

##### \---

##### 

##### \# 34. ERROR EXPERIENCE

##### 

##### Convert technical errors into user-friendly messages.

##### 

##### Do not show:

##### 

##### `HTTP 500`

##### 

##### or:

##### 

##### `ProviderError INVALID\_ACCESS\_TOKEN`

##### 

##### Show:

##### 

##### \*\*Your bank connection needs attention. Reconnect your account to continue syncing.\*\*

##### 

##### Keep detailed technical errors in logs.

##### 

##### \---

##### 

##### \# 35. EMPTY STATES

##### 

##### Examples:

##### 

##### \### Transactions

##### 

##### `No transactions yet.`

##### 

##### `Connect a bank to start tracking your finances.`

##### 

##### \### Analytics

##### 

##### `We need more transaction history before showing trends.`

##### 

##### \### Accounts

##### 

##### `No financial institutions connected.`

##### 

##### Include clear actions.

##### 

##### \---

##### 

##### \# 36. PERFORMANCE TARGET

##### 

##### Profile the application.

##### 

##### Focus on:

##### 

##### \* first load;

##### \* transaction list scrolling;

##### \* chart rendering;

##### \* API latency;

##### \* database queries;

##### \* sync processing;

##### \* startup time.

##### 

##### Avoid unnecessary rebuilds in Flutter.

##### 

##### Use pagination and caching.

##### 

##### Add appropriate database indexes.

##### 

##### \---

##### 

##### \# 37. DATABASE QUERY OPTIMIZATION

##### 

##### Review queries used for:

##### 

##### \* recent transactions;

##### \* monthly summaries;

##### \* category analytics;

##### \* account balances;

##### \* recurring detection;

##### \* search.

##### 

##### Add indexes where justified.

##### 

##### Do not repeatedly scan the full transaction table for every dashboard widget.

##### 

##### Create efficient aggregation queries/services.

##### 

##### \---

##### 

##### \# 38. ANALYTICS CACHE

##### 

##### Where useful, create an analytics caching/materialization strategy.

##### 

##### Possible approach:

##### 

##### Raw transactions remain authoritative.

##### 

##### Computed metrics may be cached by:

##### 

##### `user + time period + analytics version`

##### 

##### Invalidate/recompute when relevant transactions change.

##### 

##### Do not allow stale cached metrics to become permanent truth.

##### 

##### \---

##### 

##### \# 39. EVENT-DRIVEN UPDATE PIPELINE

##### 

##### Where architecture allows, create events such as:

##### 

##### `TransactionImported`

##### 

##### `TransactionUpdated`

##### 

##### `TransactionCategorized`

##### 

##### `BankSyncCompleted`

##### 

##### `AccountConnected`

##### 

##### `AccountDisconnected`

##### 

##### Consumers may trigger:

##### 

##### \* analytics refresh;

##### \* recurring detection;

##### \* anomaly detection;

##### \* notification evaluation.

##### 

##### Do not overengineer into microservices.

##### 

##### A clean internal event system inside the NestJS modular monolith is sufficient.

##### 

##### \---

##### 

##### \# 40. CROSS-PLATFORM QUALITY

##### 

##### Every UI and interaction must work on:

##### 

##### \* Android

##### \* iPhone

##### 

##### Check:

##### 

##### \* safe areas;

##### \* keyboard;

##### \* navigation;

##### \* gestures;

##### \* back behavior;

##### \* dialogs;

##### \* camera;

##### \* secure storage;

##### \* deep links;

##### \* bank-link callbacks;

##### \* notifications.

##### 

##### Do not create Android-only UX.

##### 

##### \---

##### 

##### \# 41. ACCESSIBILITY

##### 

##### Support:

##### 

##### \* dynamic text scaling;

##### \* sufficient contrast;

##### \* semantic labels;

##### \* large tap targets;

##### \* screen readers;

##### \* meaningful icons.

##### 

##### Do not rely solely on color to communicate income vs expense.

##### 

##### \---

##### 

##### \# 42. USER CONTROL

##### 

##### Users must remain in control.

##### 

##### Allow users to:

##### 

##### \* correct transactions;

##### \* correct categories;

##### \* create rules;

##### \* hide accounts;

##### \* disconnect banks;

##### \* manually refresh;

##### \* manage notifications;

##### \* manage privacy;

##### \* export data;

##### \* delete data/account.

##### 

##### Intelligence should assist the user, not lock them out of correcting the system.

##### 

##### \---

##### 

##### \# 43. AUDIT BEFORE IMPLEMENTING

##### 

##### Before redesigning:

##### 

##### 1\. inspect existing Flutter architecture;

##### 2\. identify reusable components;

##### 3\. inspect existing state management;

##### 4\. inspect API contracts;

##### 5\. inspect transaction models;

##### 6\. inspect analytics implementation;

##### 7\. find duplicated calculations;

##### 8\. identify performance problems;

##### 9\. inspect current bank synchronization behavior.

##### 

##### Reuse good code.

##### 

##### Replace bad foundations deliberately.

##### 

##### \---

##### 

##### \# 44. IMPLEMENTATION ORDER

##### 

##### Execute in this order:

##### 

##### 1\. Audit existing UI and transaction architecture.

##### 2\. Stabilize transaction synchronization.

##### 3\. Remove fake/demo transaction dependencies.

##### 4\. Normalize transaction data.

##### 5\. Implement correct pagination/search/filtering.

##### 6\. Build financial analytics domain layer.

##### 7\. Implement income/expense/transfer classification.

##### 8\. Build new transaction UI.

##### 9\. Build redesigned dashboard.

##### 10\. Build Analytics section.

##### 11\. Add recurring/subscription intelligence.

##### 12\. Add transfer/refund/duplicate intelligence.

##### 13\. Add insight engine.

##### 14\. Optimize loading/caching/performance.

##### 15\. Verify Android.

##### 16\. Verify iOS-compatible architecture/configuration.

##### 17\. Run complete regression/security tests.

##### 

##### Do not stop after designing screens.

##### 

##### Implement them.

##### 

##### \---

##### 

##### \# 45. COMPLETION TEST

##### 

##### The system should pass this scenario:

##### 

##### User opens FINVERSE.

##### 

##### FINVERSE immediately displays the latest cached financial overview.

##### 

##### The application synchronizes new transactions in the background.

##### 

##### A new coffee transaction arrives.

##### 

##### FINVERSE:

##### 

##### 1\. imports it;

##### 2\. prevents duplication;

##### 3\. normalizes the merchant;

##### 4\. categorizes it;

##### 5\. updates monthly spending;

##### 6\. updates category totals;

##### 7\. updates cash flow;

##### 8\. updates the dashboard;

##### 9\. updates relevant analytics;

##### 10\. displays the transaction in the feed.

##### 

##### The user changes the category.

##### 

##### FINVERSE remembers the correction and updates all affected analytics.

##### 

##### The user connects another bank.

##### 

##### The new bank's accounts and transactions merge into the same financial overview without duplicating transfers between the user's own accounts.

##### 

##### This is the level of integration expected.

##### 

##### \---

##### 

##### \# FINAL DIRECTIVE

##### 

##### Do not create a prettier version of the existing demo.

##### 

##### Create a \*\*real financial intelligence product\*\*.

##### 

##### The architecture must become:

##### 

##### \*\*REAL BANK DATA\*\*

##### 

##### ↓

##### 

##### \*\*NORMALIZED TRANSACTION ENGINE\*\*

##### 

##### ↓

##### 

##### \*\*CLASSIFICATION + USER RULES\*\*

##### 

##### ↓

##### 

##### \*\*TRANSFER / REFUND / RECURRING DETECTION\*\*

##### 

##### ↓

##### 

##### \*\*FINANCIAL ANALYTICS ENGINE\*\*

##### 

##### ↓

##### 

##### \*\*INTELLIGENT INSIGHT ENGINE\*\*

##### 

##### ↓

##### 

##### \*\*FAST API\*\*

##### 

##### ↓

##### 

##### \*\*SMOOTH ANDROID + IOS FLUTTER UI\*\*

##### 

##### Every number displayed to the user must be traceable to real financial data or an explicitly defined calculation.

##### 

##### Every intelligent insight must be explainable.

##### 

##### Every user correction must be respected.

##### 

##### Every important screen must be fast and easy to understand.

##### 

##### Start by auditing the existing implementation, then \*\*IMPLEMENT → TEST → FIX → RUN → OPTIMIZE → CONTINUE.\*\*






**# FINVERSE — FULL CODEBASE RE-AUDIT, REMOVE FAKE DATA, FIX BANK CONNECTIONS, AND REBUILD REAL FINANCIAL ANALYTICS**
---



The FINVERSE project has \*\*not gone according to plan\*\*.



Do not continue blindly from previous agent reports, roadmaps, TODO lists, or assumptions.



Your first responsibility is to \*\*re-analyze and audit the entire real codebase from top to bottom\*\*, determine what is actually working, identify fake/demo implementations and broken integrations, fix the existing product, and only then continue development.



Repository:



`C:\\Users\\samue\\OneDrive\\Desktop\\starter`



I give you permission to inspect and modify the full project.



\---



\# PRIMARY GOAL



FINVERSE must stop behaving like a demo application.



I want the application to become a \*\*real personal financial analytics platform\*\* where:



1\. A real user signs in.

2\. The user connects one or more real bank/financial accounts.

3\. FINVERSE synchronizes the user's real financial data.

4\. Fake/demo financial data disappears.

5\. The user can add, remove, reconnect, disable, or manage bank connections.

6\. Transactions and balances are associated with the correct user and account.

7\. FINVERSE automatically analyzes all imported income and expenses.

8\. The dashboard and reports are generated from the user's actual financial data.

9\. The application becomes useful for understanding spending, income, savings, cash flow, budgets, debts, subscriptions, and overall financial health.



Do not build additional cosmetic features on top of broken foundations.



\*\*Fix the foundations first.\*\*



\---



\# PHASE 1 — FULL RE-AUDIT OF THE ENTIRE PROJECT



Before writing substantial new code, inspect the complete repository.



Do not trust previous claims about what is finished.



Inspect:



\* frontend/mobile code;

\* backend API;

\* authentication;

\* database schema;

\* migrations;

\* seed scripts;

\* mock data;

\* demo users;

\* development fixtures;

\* bank provider code;

\* account connection code;

\* transaction synchronization;

\* webhooks;

\* dashboard;

\* analytics;

\* categorization;

\* budgets;

\* subscriptions;

\* credit cards;

\* reports;

\* configuration;

\* environment variables;

\* CI;

\* tests;

\* production configuration;

\* security.



Search the entire repository for terms such as:



`mock`



`fake`



`demo`



`seed`



`sample`



`fixture`



`x-user-id`



`development user`



`placeholder`



`TODO`



`FIXME`



`hardcoded`



`Bank connections are not configured`



`not configured on this server`



Determine exactly where fake financial information is entering the system.



\---



\# PHASE 2 — REPRODUCE THE CURRENT FAILURES



Run the real project.



Do not only inspect code.



Start:



\* PostgreSQL;

\* backend API;

\* Flutter/mobile application;

\* Android emulator.



Reproduce the current user experience.



Specifically reproduce this failure:



When going to:



\*\*Account → Connect Bank\*\*



the application currently reports:



`Bank connections are not configured on this server yet`



Find the exact source of this message.



Trace the complete execution path:



\*\*Flutter UI → API request → controller → service → provider adapter → configuration → database\*\*



Determine why bank connections are considered unavailable.



Do not hide the error message.



\*\*Fix the underlying cause.\*\*



\---



\# PHASE 3 — REMOVE FAKE FINANCIAL DATA



The application must no longer populate the real user dashboard with fabricated financial information.



Audit every source of demo data.



Remove or isolate:



\* fake bank accounts;

\* fake balances;

\* fake transactions;

\* fake income;

\* fake expenses;

\* fake subscriptions;

\* fake credit cards;

\* fake forecasts;

\* fake savings;

\* seeded production-user financial records.



Development/test fixtures may remain only when clearly isolated inside:



\* automated tests;

\* development-only mocks;

\* explicit demo mode.



They must never silently appear for a real logged-in user.



For a new user with no connected accounts, the application should show a proper empty state such as:



\*\*No financial accounts connected yet. Connect your first account to begin tracking your finances.\*\*



Do not replace fake data with zeros pretending that data exists.



The interface must distinguish between:



\* no data;

\* zero value;

\* disconnected account;

\* syncing;

\* synchronization error.



\---



\# PHASE 4 — FIX REAL BANK CONNECTIONS END-TO-END



This is now the highest-priority feature.



The user must be able to connect a financial institution from FINVERSE.



Audit the existing bank aggregation architecture and determine which provider it is currently designed for.



Possible providers may include:



\* Plaid;

\* Flinks;

\* another legitimate Canadian/open-banking provider.



Do not randomly add multiple providers.



First determine what the repository already supports or was designed to support.



Then make the integration actually work.



\---



\# REQUIRED BANK CONNECTION FLOW



Implement the full flow:



\*\*User\*\*



→ taps \*\*Connect Bank\*\*



→ backend creates provider connection/link session



→ mobile launches provider's secure account-linking interface



→ user chooses institution



→ user authenticates through the provider



→ provider returns temporary authorization information



→ backend exchanges it securely



→ provider access credential/token is securely stored



→ bank connection record is created



→ bank accounts are fetched



→ balances are synchronized



→ transactions are synchronized



→ user returns to FINVERSE



→ real connected accounts appear



→ dashboard refreshes using real financial data.



The flow must not depend on manually inserting IDs into the database.



\---



\# IF CREDENTIALS ARE CURRENTLY MISSING



If the error exists because provider credentials have never been configured, do not simply stop.



First implement and verify everything possible around the integration.



Then give me an exact:



\# OWNER ACTION REQUIRED



Explain:



1\. Which provider FINVERSE is configured to use.

2\. Which provider you recommend for this project.

3\. Why.

4\. Where I need to create the account.

5\. Whether sandbox/development access is available.

6\. Exactly which credentials are needed.

7\. What each credential does.

8\. Which `.env` variables they belong in.

9\. Which values are secrets.

10\. Which redirect/webhook URLs must be configured.

11\. How I can verify that setup succeeded.



Do not ask me to paste secrets into Git.



Do not hard-code credentials.



Use proper secure environment configuration.



\---



\# PHASE 5 — BANK CONNECTION MANAGEMENT



After connecting a bank, the user must have full control over their bank connections.



Create a proper:



\*\*Accounts / Connected Banks\*\*



section.



It should show each connected institution and its associated financial accounts.



Examples:



\* TD

\* RBC

\* Scotiabank

\* CIBC

\* BMO

\* Tangerine

\* Wealthsimple



Actual institutions must come from the bank provider rather than being hardcoded.



\---



\# USERS MUST BE ABLE TO ADD MULTIPLE BANKS



A user must not be limited to one bank.



Support:



\*\*Add another bank\*\*



The same user should be able to connect multiple institutions.



Example:



User:



\* TD chequing;

\* TD credit card;

\* RBC savings;

\* Wealthsimple Cash;

\* another supported financial account.



All should belong to the same FINVERSE user.



\---



\# USERS MUST ALSO BE ABLE TO REMOVE BANKS



Implement:



\*\*Remove / Disconnect Bank\*\*



When selected:



1\. clearly tell the user what will happen;

2\. ask for confirmation;

3\. revoke provider access where the provider supports it;

4\. mark/delete the connection safely;

5\. prevent future synchronization;

6\. update the dashboard;

7\. preserve or remove historical transaction data according to an explicit user choice/policy;

8\. log the security-sensitive event.



Never leave orphaned provider credentials.



\---



\# ADDITIONAL BANK MANAGEMENT



Support where appropriate:



\* reconnect bank;

\* repair expired connection;

\* refresh connection;

\* sync now;

\* rename account locally;

\* hide account from dashboards;

\* show account;

\* disconnect institution;

\* last successful sync;

\* connection status;

\* institution name;

\* account name;

\* account type;

\* masked account number;

\* current balance;

\* available balance where provided;

\* sync error.



Connection states should include something similar to:



\* Connected

\* Syncing

\* Needs attention

\* Reauthentication required

\* Disconnected

\* Error



\---



\# PHASE 6 — REAL TRANSACTION SYNCHRONIZATION



After connecting an account, fetch and persist real transactions.



Each transaction should be associated with:



\* FINVERSE user;

\* institution connection;

\* financial account;

\* provider transaction ID;

\* amount;

\* currency;

\* transaction date;

\* posting date where available;

\* merchant;

\* description;

\* category;

\* pending/posted status;

\* payment/transfer information where available;

\* metadata necessary for reconciliation.



Implement proper handling for:



\* initial sync;

\* incremental sync;

\* duplicate prevention;

\* pending → posted transactions;

\* changed transactions;

\* removed transactions;

\* provider cursors;

\* retries;

\* synchronization failures;

\* idempotency;

\* webhook-triggered synchronization where supported.



Do not duplicate a transaction every time the app synchronizes.



\---



\# PHASE 7 — BUILD THE FINANCIAL DATA ENGINE



Once real financial data is flowing, FINVERSE should become a proper \*\*financial data analytics engine\*\*.



Do not calculate dashboard values from fake constants or handcrafted examples.



Create a central analytics/domain layer that derives financial metrics from the user's actual normalized transaction/account data.



The engine should support:



\*\*Raw provider data\*\*



→ normalization



→ categorization



→ transaction classification



→ recurring detection



→ aggregation



→ financial metrics



→ insights



→ dashboards



→ reports.



Keep financial calculations separate from UI code.



\---



\# PHASE 8 — INCOME ANALYTICS



FINVERSE should calculate the user's income.



Detect and summarize:



\* salary/payroll;

\* deposits;

\* transfers;

\* refunds;

\* interest;

\* government payments;

\* freelance income;

\* other income.



Avoid treating transfers between the user's own accounts as income.



Display:



\### This Month



\* total income;

\* number of income transactions;

\* largest income source;

\* average income;

\* expected recurring income where confidence is sufficient.



Also provide:



\* previous month;

\* 3-month average;

\* 6-month average;

\* year-to-date income.



\---



\# PHASE 9 — EXPENSE ANALYTICS



Analyze the user's entire spending history.



Calculate:



\* total spending;

\* spending by category;

\* spending by merchant;

\* spending by account;

\* recurring expenses;

\* discretionary spending;

\* essential spending;

\* average daily spending;

\* average weekly spending;

\* largest expenses;

\* unusual spending;

\* spending trends.



Example categories:



\* Housing

\* Groceries

\* Restaurants

\* Transportation

\* Fuel

\* Utilities

\* Phone

\* Internet

\* Insurance

\* Healthcare

\* Shopping

\* Entertainment

\* Travel

\* Education

\* Subscriptions

\* Debt payments

\* Bank fees

\* Personal care

\* Gifts

\* Transfers

\* Taxes

\* Other



Categories should remain editable.



\---



\# PHASE 10 — DO NOT MISCOUNT TRANSFERS



This is extremely important.



If the user transfers:



`$1,000`



from TD Chequing to TD Savings, FINVERSE must not report:



`$1,000 expense + $1,000 income`



unless there is legitimate evidence that this was external income/expense.



Create transfer detection/reconciliation.



Recognize likely internal transfers using available information such as:



\* amounts;

\* timestamps;

\* account ownership;

\* transaction descriptions;

\* linked accounts;

\* provider metadata.



Allow manual correction if necessary.



\---



\# PHASE 11 — DASHBOARD



Rebuild the dashboard around real analytics.



Show meaningful current financial information.



At minimum:



\## Net Cash Position



Available cash/liquid balances where meaningful.



\## Income This Month



Current total and change from previous period.



\## Expenses This Month



Current total and change from previous period.



\## Net Cash Flow



`Income - Expenses`



\## Savings



Estimated amount saved during the period.



\## Savings Rate



Appropriate calculation based on genuine income and expenses.



\## Spending Breakdown



Category visualization.



\## Recent Transactions



Actual imported transactions.



\## Upcoming Recurring Expenses



Detected subscriptions/bills.



\## Credit Cards



Balances and utilization where available.



\## Cash-Flow Forecast



Projected future balance based on recurring patterns and known commitments.



\## Financial Health



Explainable score/indicators if retained.



Every number on this screen must trace back to actual stored data or an explicitly described calculation.



\---



\# PHASE 12 — TIME PERIODS



Analytics should support at least:



\* Today

\* This Week

\* This Month

\* Last Month

\* Last 3 Months

\* Last 6 Months

\* This Year

\* Custom Range



Period comparison should work correctly.



Example:



\*\*Dining spending is up 18% compared with last month.\*\*



Only show such insights when enough data exists.



\---



\# PHASE 13 — TRANSACTION EXPLORER



Create a proper transaction screen.



Support:



\* all accounts;

\* single account;

\* search;

\* merchant;

\* category;

\* amount;

\* date;

\* income/expense;

\* pending/posted;

\* recurring/non-recurring;

\* custom date range.



Transaction detail should allow the user to:



\* inspect transaction information;

\* change category;

\* mark transfer;

\* correct merchant;

\* add note if supported;

\* exclude a transaction from certain analytics where justified.



User corrections should persist.



\---



\# PHASE 14 — CATEGORY LEARNING



If the user repeatedly changes:



`PAYPAL \*NETFLIX`



from:



`Other`



to:



`Subscriptions`



FINVERSE should remember the correction.



Build deterministic categorization rules based on:



\* merchant;

\* normalized description;

\* provider category;

\* user corrections.



User-created corrections should have higher priority than generic defaults.



Keep this explainable and testable.



\---



\# PHASE 15 — RECURRING PAYMENTS AND SUBSCRIPTIONS



Analyze transaction history for recurring patterns.



Detect:



\* subscriptions;

\* rent;

\* utilities;

\* phone;

\* internet;

\* insurance;

\* loan payments;

\* memberships;

\* other recurring expenses.



Estimate:



\* frequency;

\* next expected charge;

\* average amount;

\* annual cost;

\* price increases.



Avoid claiming certainty when detection confidence is low.



\---



\# PHASE 16 — CASH FLOW ENGINE



Create a proper cash-flow engine.



Use:



\* current balances;

\* expected income;

\* recurring expenses;

\* known bills;

\* historical patterns.



Estimate:



\* end-of-week balance;

\* end-of-month balance;

\* upcoming low-balance risk;

\* available discretionary cash.



Clearly distinguish:



\*\*actual\*\*



from



\*\*forecast\*\*



values.



\---



\# PHASE 17 — DATA QUALITY ENGINE



Financial analytics are only useful if the underlying data is trustworthy.



Create checks for:



\* duplicate transactions;

\* missing account association;

\* unexpected currency;

\* invalid dates;

\* malformed values;

\* inconsistent pending/posted records;

\* stale synchronization;

\* disconnected institutions;

\* incomplete historical coverage.



The analytics layer should not silently produce confident results from obviously incomplete data.



\---



\# PHASE 18 — EMPTY, LOADING AND ERROR STATES



Make the application behave professionally.



Examples:



\### No connected bank



Show:



\*\*Connect your first financial account to start building your financial overview.\*\*



\### Synchronizing



Show:



\*\*Syncing your latest bank activity...\*\*



\### Provider needs attention



Show:



\*\*Your TD connection needs to be re-authenticated.\*\*



\### No transactions yet



Show an appropriate empty state rather than fake transactions.



\### Provider unavailable



Show a real actionable error rather than silently switching to demo data.



\---



\# PHASE 19 — SECURITY



Banking information is sensitive.



Audit:



\* user isolation;

\* authorization;

\* bank access token storage;

\* refresh/session tokens;

\* encryption at rest;

\* secure mobile storage;

\* logs;

\* API responses;

\* environment configuration;

\* database access;

\* webhook security.



Never display or log full provider access tokens.



Never expose one user's account or transaction data to another user.



Add explicit cross-user security tests.



\---



\# PHASE 20 — DATABASE AUDIT



Review the current database schema.



Create or correct models for concepts such as:



\* User

\* BankConnection

\* FinancialInstitution

\* FinancialAccount

\* Transaction

\* TransactionCategory

\* CategorizationRule

\* SyncState

\* RecurringTransaction

\* Budget

\* Goal

\* Notification

\* AuditEvent



Do not create duplicates of existing good models unnecessarily.



Use migrations.



Do not manually mutate production-style schemas without migration history.



\---



\# PHASE 21 — TEST THE COMPLETE USER JOURNEY



Create or verify tests covering:



\*\*Register\*\*



→ \*\*Login\*\*



→ \*\*Connect bank\*\*



→ \*\*Select institution\*\*



→ \*\*Complete provider flow\*\*



→ \*\*Store bank connection\*\*



→ \*\*Import accounts\*\*



→ \*\*Import transactions\*\*



→ \*\*Open dashboard\*\*



→ \*\*See real analytics\*\*



→ \*\*Add second bank\*\*



→ \*\*See combined analytics\*\*



→ \*\*Remove one bank\*\*



→ \*\*Dashboard updates correctly\*\*



→ \*\*Reconnect bank\*\*



→ \*\*Synchronization resumes\*\*



Also test:



\* cross-user access;

\* duplicates;

\* failed sync;

\* expired provider connection;

\* no transactions;

\* internal transfers;

\* incorrect categorization;

\* manual category corrections.



\---



\# PHASE 22 — ACTUALLY RUN THE APPLICATION



Do not declare completion based only on unit tests.



Run the Android application on:



`finverse\_pixel`



Walk through the relevant screens.



Verify:



\* Connect Bank button works;

\* bank connection flow launches;

\* Accounts page works;

\* add additional bank works;

\* disconnect action works;

\* transaction screen works;

\* dashboard updates;

\* loading state works;

\* error state works;

\* empty state works.



If sandbox provider credentials are available, perform the sandbox connection flow end-to-end.



\---



\# PHASE 23 — DO NOT HIDE FAILURES WITH MOCKS



A critical rule:



If the real bank provider fails, do \*\*not\*\* silently switch the production user to fake financial data.



Mocks may exist only under explicit development/test configuration.



Production-style behavior should clearly say:



\*\*Bank synchronization unavailable\*\*



rather than inventing bank information.



\---



\# PHASE 24 — REMOVE DEAD/BROKEN CODE AFTER VALIDATION



Once replacement implementations are verified:



\* remove obsolete fake code;

\* remove unused demo paths;

\* remove dead provider stubs;

\* remove stale environment flags;

\* remove abandoned implementations;

\* remove misleading comments.



Do this carefully.



Do not delete anything until you understand whether another feature depends on it.



\---



\# PHASE 25 — TEST AFTER EVERY MAJOR CHANGE



Use:



\*\*Implement → Test → Fix → Continue\*\*



Run appropriate:



\* backend tests;

\* database tests;

\* integration tests;

\* Flutter tests;

\* Flutter analyze;

\* backend build;

\* typecheck;

\* Android build.



Do not accumulate dozens of untested changes.



\---



\# PHASE 26 — DO NOT STOP AFTER WRITING A REPORT



This task is not:



\*\*“Audit FINVERSE and tell me what is wrong.”\*\*



This task is:



\*\*“Audit FINVERSE, find what is wrong, then repair it.”\*\*



Do not spend the whole session generating documentation.



After identifying a fixable problem:



\*\*fix it.\*\*



After fixing it:



\*\*test it.\*\*



Then continue.



\---



\# PHASE 27 — PRIORITY ORDER



Work in this order unless a more severe dependency is discovered:



1\. Repository/Git safety

2\. Full code audit

3\. Reproduce current failures

4\. Identify fake/demo data

5\. Fix authentication/user identity where necessary

6\. Fix database ownership/isolation

7\. Fix Bank Connections configuration error

8\. Complete bank provider integration

9\. Remove fake financial data from normal users

10\. Implement multiple bank support

11\. Implement disconnect/reconnect/account management

12\. Stabilize transaction synchronization

13\. Implement transfer detection

14\. Rebuild analytics engine

15\. Rebuild dashboard on real data

16\. Transaction explorer

17\. Category learning

18\. Recurring/subscription analytics

19\. Cash-flow analytics

20\. Data-quality protections

21\. Security audit

22\. Full integration testing

23\. Android end-to-end validation

24\. Documentation update

25\. Final adversarial review



\---



\# PHASE 28 — OWNER INVOLVEMENT



Do not ask me for something unless the project genuinely cannot proceed without it.



If an external dependency is required, use this exact structure:



\# OWNER ACTION REQUIRED



\## Blocking feature



State exactly what cannot proceed.



\## What is missing



Example:



`PLAID\_CLIENT\_ID`



`PLAID\_SECRET`



\## Why



Explain why it is required.



\## Steps



Give me exact step-by-step instructions.



\## Send back



Tell me exactly what information or confirmation you need.



\## Security



Tell me which values are secrets and where to store them.



Then continue working on unrelated tasks.



\---



\# FINAL SUCCESS CRITERIA



The corrective phase is successful only when:



\* fake financial data no longer appears for real users;

\* the Bank Connections error has been eliminated or reduced only to a genuine missing external credential with exact owner instructions;

\* users can connect a bank;

\* users can connect multiple institutions;

\* users can view connected accounts;

\* users can remove/disconnect an institution;

\* users can reconnect an institution;

\* real accounts persist correctly;

\* real transactions synchronize correctly;

\* duplicate transactions are prevented;

\* internal transfers are handled properly;

\* analytics operate on actual normalized financial data;

\* income is calculated correctly;

\* expenses are calculated correctly;

\* spending categories are meaningful;

\* dashboard values come from real data;

\* period comparisons work;

\* user corrections persist;

\* data is isolated per user;

\* Android application flows are verified;

\* relevant tests/builds pass.



\---



\# BEGIN NOW



Open:



`C:\\Users\\samue\\OneDrive\\Desktop\\starter`



Do not assume the previous implementation is correct.



Start by inspecting the repository and Git working tree.



Then reproduce:



`Account → Connect Bank → "Bank connections are not configured on this server yet"`



Trace that problem through the mobile app, backend, configuration, provider implementation, and database.



At the same time identify every place fake financial data enters the normal application.



Then begin repairing the system.



\*\*The immediate objective is simple:\*\*



\*\*REMOVE THE DEMO BEHAVIOR.\*\*



\*\*MAKE BANK CONNECTIONS REAL.\*\*



\*\*GIVE USERS COMPLETE CONTROL OF THEIR CONNECTED ACCOUNTS.\*\*



\*\*MAKE FINVERSE ANALYZE THE USER'S REAL INCOME AND EXPENSES.\*\*



Do not stop at analysis.



\*\*AUDIT → FIX → TEST → RUN → VERIFY → CONTINUE.\*\*









### 

### **# CROSS-PLATFORM REQUIREMENT — ANDROID + IOS ARE BOTH FIRST-CLASS TARGETS**



FINVERSE must be built and maintained as a \*\*true cross-platform mobile application for both Android and iOS\*\*.



Do not treat iOS as a later optional port.



The Flutter application must be architected so the same core product, business logic, API integrations, analytics, authentication, bank connections, privacy controls, notifications, offline storage, reports, subscriptions, and user-account management work consistently on:



\* Android

\* iOS



The goal is:



\*\*One FINVERSE product → One shared Flutter codebase → Android + iOS production applications.\*\*



\---



\## PLATFORM PARITY REQUIREMENT



Unless a platform limitation makes something impossible, every user-facing FINVERSE feature must work on both operating systems.



This includes:



\* registration;

\* login;

\* logout;

\* authentication;

\* session management;

\* MFA;

\* passkeys where supported;

\* biometric lock;

\* bank connection;

\* multiple bank connections;

\* bank removal;

\* bank reconnection;

\* transaction synchronization;

\* transaction search/filtering;

\* account balances;

\* dashboards;

\* financial analytics;

\* income tracking;

\* expense tracking;

\* categorization;

\* budgets;

\* subscriptions;

\* cash-flow forecasting;

\* savings goals;

\* credit-card analytics;

\* financial reports;

\* notifications;

\* offline storage;

\* data export;

\* privacy settings;

\* account deletion;

\* receipt scanning;

\* AI financial assistant if implemented;

\* subscription/billing entitlements.



Do not implement important application functionality using Android-only APIs unless there is an equivalent iOS implementation.



\---



\# FLUTTER ARCHITECTURE



Keep as much functionality as reasonably possible inside shared Dart/Flutter code.



Prefer:



\*\*Shared UI\*\*



\*



\*\*Shared domain/business logic\*\*



\*



\*\*Shared API layer\*\*



\*



\*\*Shared analytics engine\*\*



\*



\*\*Small platform-specific adapters only where required\*\*



Avoid duplicated Android and iOS implementations.



Platform-specific code should be isolated behind interfaces.



For example:



`BiometricService`



`SecureStorageService`



`NotificationService`



`DeepLinkService`



`BankLinkLauncher`



`FileExportService`



`ReceiptCaptureService`



The rest of FINVERSE should depend on these abstractions rather than directly depending on Android/iOS APIs.



\---



\# BANK CONNECTIONS MUST WORK ON BOTH PLATFORMS



The real bank connection flow must be verified for:



\### Android



and



\### iOS.



The flow should support:



\*\*FINVERSE\*\*



→ Connect Bank



→ secure provider Link experience



→ institution selection



→ bank authentication



→ successful provider authorization



→ backend token exchange



→ account synchronization



→ transaction synchronization



→ FINVERSE account/dashboard refresh.



Handle mobile-specific requirements such as:



\* deep links;

\* universal links;

\* app links;

\* OAuth callbacks;

\* redirect URIs;

\* provider SDK requirements;

\* browser handoff;

\* return-to-app flow.



Do not build the bank integration in a way that works only on the Android emulator.



\---



\# IOS PROJECT AUDIT



Inspect:



`apps/mobile/ios`



Verify:



\* bundle identifier;

\* deployment target;

\* `Info.plist`;

\* entitlements;

\* permissions;

\* URL schemes;

\* universal links;

\* associated domains where required;

\* bank-provider callback configuration;

\* biometric permissions;

\* camera/photo permissions;

\* notification permissions;

\* network/security configuration;

\* secure storage/keychain integration;

\* application lifecycle handling;

\* background behavior where needed.



Fix everything that can be fixed without access to Apple signing infrastructure.



\---



\# ANDROID PROJECT AUDIT



Inspect:



`apps/mobile/android`



Verify:



\* application ID;

\* minimum SDK;

\* target SDK;

\* permissions;

\* manifest;

\* deep links;

\* app links;

\* bank-provider redirects;

\* notification configuration;

\* biometric integration;

\* secure storage;

\* network-security configuration;

\* release build configuration.



The architecture should remain equivalent between platforms.



\---



\# SECURE STORAGE



Sensitive mobile information must use platform-backed secure storage.



Android should use appropriate secure storage backed by the Android security system.



iOS should use Keychain-backed storage.



Never store sensitive authentication or provider credentials in:



\* SharedPreferences;

\* plain SQLite;

\* local JSON;

\* unencrypted files;

\* logs.



Bank provider access credentials should preferably remain server-side unless a provider explicitly requires otherwise.



\---



\# BIOMETRICS



Where enabled, support:



Android:



\* fingerprint;

\* supported biometric authentication.



iOS:



\* Face ID;

\* Touch ID.



Biometrics should protect access to the FINVERSE application or sensitive locally stored information.



They should not replace proper server authentication.



\---



\# NOTIFICATIONS



Design notifications for both:



Android:



\* Firebase Cloud Messaging where appropriate.



iOS:



\* Apple Push Notification Service, normally through the selected push infrastructure.



Also support local notifications where appropriate.



Users must be able to configure notification preferences from FINVERSE.



\---



\# RECEIPT SCANNING



If receipt scanning is implemented:



Android and iOS must both support:



\* camera capture;

\* image selection;

\* permission handling;

\* upload;

\* OCR processing;

\* receipt review.



Do not make receipt scanning Android-only.



\---



\# FILES AND REPORTS



PDF and CSV reports must work on both platforms.



Support appropriate:



\* viewing;

\* sharing;

\* saving/exporting.



Use Flutter/platform abstraction instead of hardcoded Windows/Android file paths.



\---



\# OFFLINE-FIRST SUPPORT



Encrypted local storage and offline access must be designed for both Android and iOS.



Verify:



\* app restart;

\* device offline;

\* queued updates;

\* re-sync;

\* user logout;

\* account deletion;

\* secure local-data cleanup.



\---



\# RESPONSIVE UI



Test FINVERSE across different device sizes.



Do not design only for the current Android emulator.



Check:



\* small phones;

\* larger phones;

\* different aspect ratios;

\* notches;

\* Dynamic Island/safe areas;

\* Android navigation areas;

\* text scaling;

\* keyboard behavior.



Use Flutter safe areas and responsive layout correctly.



\---



\# PLATFORM-SPECIFIC BILLING



If FINVERSE introduces paid mobile subscriptions, do not assume one universal payment implementation.



Evaluate the current Apple and Google store requirements before implementing billing.



Architect entitlement management centrally so FINVERSE can support:



Android:



\* Google Play billing.



iOS:



\* Apple in-app purchase / StoreKit.



Backend entitlement state should normalize the result where appropriate.



Do not bypass platform payment policies.



\---



\# TESTING



Shared Dart logic should receive shared automated tests.



Also perform platform-specific verification.



\## Android



Run:



\* `flutter analyze`

\* Flutter tests

\* Android debug build

\* Android release build where possible

\* emulator/device testing



Use the available:



`finverse\_pixel`



emulator.



\## iOS



Run everything that can be validated from the current environment.



If the current machine cannot compile iOS because it is Windows, do not ignore iOS.



Instead:



1\. inspect and prepare all iOS code/configuration;

2\. keep Flutter dependencies iOS-compatible;

3\. remove Android-only assumptions;

4\. document unresolved native requirements;

5\. prepare exact Mac/Xcode validation instructions.



\---



\# IOS OWNER ACTION — ONLY WHEN ACTUALLY REQUIRED



A Windows environment cannot perform the final native iOS build/signing process.



When the project reaches that boundary, give me:



\# OWNER ACTION REQUIRED — IOS



Explain exactly:



1\. whether I need a Mac or cloud macOS environment;

2\. required macOS/Xcode versions;

3\. how to create the Apple Developer account;

4\. how to configure the bundle ID;

5\. how to configure signing;

6\. how to configure capabilities;

7\. which provider redirect URLs must be registered;

8\. how to run FINVERSE on an iPhone;

9\. how to generate an Archive;

10\. how to test through TestFlight;

11\. what results/errors I should send back.



Do not simply write:



`iOS requires a Mac.`



Prepare everything possible before that point.



\---



\# CONTINUOUS CROSS-PLATFORM CHECK



Whenever you add or change a Flutter dependency, check whether it supports:



\*\*Android AND iOS.\*\*



Whenever you implement a feature, ask internally:



\*\*Does this work correctly on Android?\*\*



\*\*Does this work correctly on iOS?\*\*



If not, fix the architecture before proceeding.



Do not allow large amounts of Android-only technical debt to accumulate.



\---



\# DEFINITION OF DONE FOR MOBILE FEATURES



A mobile feature should not be marked complete merely because it works on `finverse\_pixel`.



For shared functionality, completion means:



\* shared Dart implementation exists;

\* Android compatibility verified;

\* iOS compatibility verified at code/configuration level;

\* platform-specific adapters exist when required;

\* tests pass;

\* no unsupported platform dependency has been introduced;

\* final iOS native verification requirements are documented when Windows prevents execution.



\---



\# FINAL PRODUCT TARGET



FINVERSE must ultimately ship as:



\### FINVERSE for Android



and



\### FINVERSE for iPhone



with the same user account and financial data accessible from either platform.



A user should be able to:



\*\*Connect bank on Android → sign into FINVERSE on iPhone → see the same securely synchronized financial information.\*\*



Bank connections, transactions, categories, budgets, goals, reports, preferences, and analytics must therefore belong to the user's \*\*server-side FINVERSE account\*\*, not to one specific phone.



The phone is a secure client.



The backend is the authoritative source for synchronized financial information.



\---



Add this requirement to every relevant part of the existing FINVERSE corrective plan:



\*\*DO NOT BUILD FINVERSE AS AN ANDROID APP THAT MAY LATER BE PORTED TO IOS. BUILD IT FROM NOW ON AS A CROSS-PLATFORM ANDROID + IOS PRODUCT.\*\*



