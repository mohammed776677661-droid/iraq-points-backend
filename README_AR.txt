منصة العراق التعليمية — خادم النقاط

هذا الخادم يضيف/يقرأ رصيد الطالب من PostgreSQL مشتركة، حتى يظهر الرصيد على أجهزة مختلفة.

متطلبات النشر على Render:
1) أنشئ قاعدة PostgreSQL من Render.
2) أنشئ Web Service جديداً من مستودع GitHub الذي يحتوي مجلد iraq-points-backend.
3) Root Directory = iraq-points-backend
4) Build Command = npm install
5) Start Command = npm start
6) Environment Variables:
   DATABASE_URL = Internal Database URL لقاعدة Render PostgreSQL
   ADMIN_TOKEN = رمز طويل عشوائي خاص بالمسؤول (لا تنشره ولا ترسله للطلاب)
   NODE_ENV = production
7) بعد نجاح النشر، افتح https://YOUR-SERVICE.onrender.com/health وتأكد أن ok و databaseReady كلاهما true.
8) في المنصة: لوحة الإدارة > ربط الذكاء الاصطناعي والطلبات، ألصق رابط خدمة النقاط واحفظه.
9) افتح لوحة التحكم بالنقاط، أدخل ايدي الطالب، النقاط، ورمز ADMIN_TOKEN ثم أرسل.
10) يجب أن يكون الطالب مسجلاً بنفس الايدي الذي أرسل المسؤول إليه. افتح المنصة عند الطالب مع اتصال الإنترنت؛ سيجلب الرصيد من الخادم.

مهم:
- لا تستخدم رابط الموقع الثابت بدلاً من رابط خدمة النقاط؛ استخدم رابط Web Service الجديد.
- لا تضع ADMIN_TOKEN في رابط الخدمة أو ترسله للطلاب.
- رمز المسؤول يُدخل في خانة لوحة الإدارة فقط. لا تحفظه في ملف HTML أو مستودع GitHub.
- هذا الخادم مخصص للنقاط فقط، وليس لتوليد الأسئلة أو الإشعارات.
