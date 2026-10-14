--
-- PostgreSQL database dump
--

\restrict AFtsmWdaehBfiRDwpjzbkA0QyR3cQP9isIKDEqhbdvCv76VNW6kNGLfwHH9B7Ux

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: checkin_history; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.checkin_history (
    "checkinId" integer NOT NULL,
    "checkinDate" text NOT NULL,
    "previousPlanId" integer,
    "newPlanId" integer NOT NULL,
    "loggedNutritionDays" integer NOT NULL,
    "weighInDays" integer NOT NULL,
    "tdeeSnapshot" integer NOT NULL,
    "trendWeightSnapshot" double precision NOT NULL,
    "adherenceRating" double precision,
    "coachNotes" text,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.checkin_history OWNER TO macrofactor;

--
-- Name: checkin_history_checkinId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."checkin_history_checkinId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."checkin_history_checkinId_seq" OWNER TO macrofactor;

--
-- Name: checkin_history_checkinId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."checkin_history_checkinId_seq" OWNED BY public.checkin_history."checkinId";


--
-- Name: daily_macro_targets; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.daily_macro_targets (
    "targetId" integer NOT NULL,
    "planId" integer NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "targetCalories" integer NOT NULL,
    "isHigherCalorieDay" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.daily_macro_targets OWNER TO macrofactor;

--
-- Name: daily_macro_targets_targetId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."daily_macro_targets_targetId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."daily_macro_targets_targetId_seq" OWNER TO macrofactor;

--
-- Name: daily_macro_targets_targetId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."daily_macro_targets_targetId_seq" OWNED BY public.daily_macro_targets."targetId";


--
-- Name: daily_nutrition_rollups; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.daily_nutrition_rollups (
    "logDate" text NOT NULL,
    "totalCaloriesKcal" integer DEFAULT 0 NOT NULL,
    "isFasting" boolean DEFAULT false NOT NULL,
    "isLoggingComplete" boolean DEFAULT true NOT NULL,
    notes text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isPartial" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.daily_nutrition_rollups OWNER TO macrofactor;

--
-- Name: goals; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.goals (
    "goalId" integer NOT NULL,
    "goalType" text DEFAULT 'weight_loss'::text NOT NULL,
    "startWeightKg" double precision NOT NULL,
    "targetWeightKg" double precision,
    "weeklyRatePercent" double precision DEFAULT '-0.50'::numeric NOT NULL,
    "weeklyRateKg" double precision NOT NULL,
    "startDate" text NOT NULL,
    "targetDate" text,
    status text DEFAULT 'active'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endDate" text,
    "etaWeeks" integer,
    "finalTrendWeightKg" double precision,
    hidden boolean DEFAULT false NOT NULL,
    "initialTrendWeightKg" double precision DEFAULT 78.0 NOT NULL,
    "scaleReached" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.goals OWNER TO macrofactor;

--
-- Name: goals_goalId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."goals_goalId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."goals_goalId_seq" OWNER TO macrofactor;

--
-- Name: goals_goalId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."goals_goalId_seq" OWNED BY public.goals."goalId";


--
-- Name: scale_weight_entries; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.scale_weight_entries (
    "entryId" integer NOT NULL,
    "logDate" text NOT NULL,
    "loggedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "weightKg" double precision NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.scale_weight_entries OWNER TO macrofactor;

--
-- Name: scale_weight_entries_entryId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."scale_weight_entries_entryId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."scale_weight_entries_entryId_seq" OWNER TO macrofactor;

--
-- Name: scale_weight_entries_entryId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."scale_weight_entries_entryId_seq" OWNED BY public.scale_weight_entries."entryId";


--
-- Name: tdee_entries; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.tdee_entries (
    "logDate" text NOT NULL,
    "expenditureKcal" integer NOT NULL,
    status text DEFAULT 'updating'::text NOT NULL,
    "tdeeDeltaKcal" integer DEFAULT 0 NOT NULL,
    "fluxLowerKcal" integer NOT NULL,
    "fluxUpperKcal" integer NOT NULL,
    "algorithmVersion" text DEFAULT 'v3'::text NOT NULL,
    "isManualOverride" boolean DEFAULT false NOT NULL,
    "calculatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.tdee_entries OWNER TO macrofactor;

--
-- Name: tdee_overrides; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.tdee_overrides (
    "overrideId" integer NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text,
    "overrideTdeeKcal" integer NOT NULL,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.tdee_overrides OWNER TO macrofactor;

--
-- Name: tdee_overrides_overrideId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."tdee_overrides_overrideId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."tdee_overrides_overrideId_seq" OWNER TO macrofactor;

--
-- Name: tdee_overrides_overrideId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."tdee_overrides_overrideId_seq" OWNED BY public.tdee_overrides."overrideId";


--
-- Name: user_profile; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.user_profile (
    id integer DEFAULT 1 NOT NULL,
    "biologicalSex" text DEFAULT 'male'::text NOT NULL,
    "birthDate" text DEFAULT '1998-05-15'::text NOT NULL,
    "heightCm" double precision DEFAULT 178.0 NOT NULL,
    "initialWeightKg" double precision DEFAULT 78.0 NOT NULL,
    "baselineTdee" integer DEFAULT 2340 NOT NULL,
    "bmrEquation" text DEFAULT 'macrofactor_2024'::text NOT NULL,
    "checkInDay" integer DEFAULT 1 NOT NULL,
    "fastCheckIn" boolean DEFAULT false NOT NULL,
    "weightUnit" text DEFAULT 'kg'::text NOT NULL,
    "energyUnit" text DEFAULT 'kcal'::text NOT NULL,
    "trendAlgorithm" text DEFAULT 'v2_kalman'::text NOT NULL,
    "expenditureAlgorithm" text DEFAULT 'v3'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.user_profile OWNER TO macrofactor;

--
-- Name: weekly_plans; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.weekly_plans (
    "planId" integer NOT NULL,
    "goalId" integer NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text NOT NULL,
    "checkInDate" text NOT NULL,
    "programStyle" text DEFAULT 'coached'::text NOT NULL,
    "dietStyle" text DEFAULT 'balanced'::text NOT NULL,
    "proteinPrefGPerKg" double precision DEFAULT 2.0 NOT NULL,
    "tdeeAtCheckin" integer NOT NULL,
    "weightAtCheckin" double precision NOT NULL,
    "dailyDeficitKcal" integer NOT NULL,
    "weeklyBudgetKcal" integer NOT NULL,
    "targetCalories" integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.weekly_plans OWNER TO macrofactor;

--
-- Name: weekly_plans_planId_seq; Type: SEQUENCE; Schema: public; Owner: macrofactor
--

CREATE SEQUENCE public."weekly_plans_planId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."weekly_plans_planId_seq" OWNER TO macrofactor;

--
-- Name: weekly_plans_planId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macrofactor
--

ALTER SEQUENCE public."weekly_plans_planId_seq" OWNED BY public.weekly_plans."planId";


--
-- Name: weight_trend_entries; Type: TABLE; Schema: public; Owner: macrofactor
--

CREATE TABLE public.weight_trend_entries (
    "logDate" text NOT NULL,
    "trendWeightKg" double precision NOT NULL,
    "velocityKgPerDay" double precision DEFAULT 0.0 NOT NULL,
    "noiseRangeLowerKg" double precision,
    "noiseRangeUpperKg" double precision,
    "algorithmVersion" text DEFAULT 'v2_kalman'::text NOT NULL,
    "calculatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.weight_trend_entries OWNER TO macrofactor;

--
-- Name: checkin_history checkinId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.checkin_history ALTER COLUMN "checkinId" SET DEFAULT nextval('public."checkin_history_checkinId_seq"'::regclass);


--
-- Name: daily_macro_targets targetId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.daily_macro_targets ALTER COLUMN "targetId" SET DEFAULT nextval('public."daily_macro_targets_targetId_seq"'::regclass);


--
-- Name: goals goalId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.goals ALTER COLUMN "goalId" SET DEFAULT nextval('public."goals_goalId_seq"'::regclass);


--
-- Name: scale_weight_entries entryId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.scale_weight_entries ALTER COLUMN "entryId" SET DEFAULT nextval('public."scale_weight_entries_entryId_seq"'::regclass);


--
-- Name: tdee_overrides overrideId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.tdee_overrides ALTER COLUMN "overrideId" SET DEFAULT nextval('public."tdee_overrides_overrideId_seq"'::regclass);


--
-- Name: weekly_plans planId; Type: DEFAULT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.weekly_plans ALTER COLUMN "planId" SET DEFAULT nextval('public."weekly_plans_planId_seq"'::regclass);


--
-- Data for Name: checkin_history; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.checkin_history ("checkinId", "checkinDate", "previousPlanId", "newPlanId", "loggedNutritionDays", "weighInDays", "tdeeSnapshot", "trendWeightSnapshot", "adherenceRating", "coachNotes", "completedAt") FROM stdin;
\.


--
-- Data for Name: daily_macro_targets; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.daily_macro_targets ("targetId", "planId", "dayOfWeek", "targetCalories", "isHigherCalorieDay") FROM stdin;
64	10	0	1931	f
65	10	1	1931	f
66	10	2	1931	f
67	10	3	1931	f
68	10	4	1931	f
69	10	5	1931	f
70	10	6	1931	f
71	11	0	1931	f
72	11	1	1931	f
73	11	2	1931	f
74	11	3	1931	f
75	11	4	1931	f
76	11	5	1931	f
77	11	6	1931	f
78	12	0	1900	f
79	12	1	1900	f
80	12	2	1900	f
81	12	3	1900	f
82	12	4	1900	f
83	12	5	2250	t
84	12	6	2250	t
85	13	0	2100	f
86	13	1	2100	f
87	13	2	2100	f
88	13	3	2100	f
89	13	4	2100	f
90	13	5	2100	f
91	13	6	2100	f
92	14	0	1931	f
93	14	1	1931	f
94	14	2	1931	f
95	14	3	1931	f
96	14	4	1931	f
97	14	5	1931	f
98	14	6	1931	f
99	15	0	1900	f
100	15	1	1900	f
101	15	2	1900	f
102	15	3	1900	f
103	15	4	1900	f
104	15	5	2250	t
105	15	6	2250	t
106	16	0	2100	f
107	16	1	2100	f
108	16	2	2100	f
109	16	3	2100	f
110	16	4	2100	f
111	16	5	2100	f
112	16	6	2100	f
197	29	0	1931	f
198	29	1	1931	f
199	29	2	1931	f
200	29	3	1931	f
201	29	4	1931	f
202	29	5	1931	f
203	29	6	1931	f
113	17	0	1931	f
114	17	1	1931	f
115	17	2	1931	f
116	17	3	1931	f
117	17	4	1931	f
118	17	5	1931	f
119	17	6	1931	f
120	18	0	1900	f
121	18	1	1900	f
122	18	2	1900	f
123	18	3	1900	f
124	18	4	1900	f
125	18	5	2250	t
126	18	6	2250	t
127	19	0	2100	f
128	19	1	2100	f
129	19	2	2100	f
130	19	3	2100	f
131	19	4	2100	f
132	19	5	2100	f
133	19	6	2100	f
134	20	0	1931	f
135	20	1	1931	f
136	20	2	1931	f
137	20	3	1931	f
138	20	4	1931	f
139	20	5	1931	f
140	20	6	1931	f
141	21	0	1931	f
142	21	1	1931	f
143	21	2	1931	f
144	21	3	1931	f
145	21	4	1931	f
146	21	5	1931	f
147	21	6	1931	f
148	22	0	1931	f
149	22	1	1931	f
150	22	2	1931	f
151	22	3	1931	f
152	22	4	1931	f
153	22	5	1931	f
154	22	6	1931	f
155	23	0	1900	f
156	23	1	1900	f
157	23	2	1900	f
158	23	3	1900	f
159	23	4	1900	f
160	23	5	2250	t
161	23	6	2250	t
162	24	0	2100	f
163	24	1	2100	f
164	24	2	2100	f
165	24	3	2100	f
166	24	4	2100	f
167	24	5	2100	f
168	24	6	2100	f
169	25	0	1931	f
170	25	1	1931	f
171	25	2	1931	f
172	25	3	1931	f
173	25	4	1931	f
174	25	5	1931	f
175	25	6	1931	f
176	26	0	1900	f
177	26	1	1900	f
178	26	2	1900	f
179	26	3	1900	f
180	26	4	1900	f
181	26	5	2250	t
182	26	6	2250	t
183	27	0	2100	f
184	27	1	2100	f
185	27	2	2100	f
186	27	3	2100	f
187	27	4	2100	f
188	27	5	2100	f
189	27	6	2100	f
190	28	0	1931	f
191	28	1	1931	f
192	28	2	1931	f
193	28	3	1931	f
194	28	4	1931	f
195	28	5	1931	f
196	28	6	1931	f
204	30	0	1931	f
205	30	1	1931	f
206	30	2	1931	f
207	30	3	1931	f
208	30	4	1931	f
209	30	5	1931	f
210	30	6	1931	f
211	31	0	1900	f
212	31	1	1900	f
213	31	2	1900	f
214	31	3	1900	f
215	31	4	1900	f
216	31	5	2250	t
217	31	6	2250	t
218	32	0	2100	f
219	32	1	2100	f
220	32	2	2100	f
221	32	3	2100	f
222	32	4	2100	f
223	32	5	2100	f
224	32	6	2100	f
225	33	0	1931	f
226	33	1	1931	f
227	33	2	1931	f
228	33	3	1931	f
229	33	4	1931	f
230	33	5	1931	f
231	33	6	1931	f
232	34	0	1900	f
233	34	1	1900	f
234	34	2	1900	f
235	34	3	1900	f
236	34	4	1900	f
237	34	5	2250	t
238	34	6	2250	t
239	35	0	2100	f
240	35	1	2100	f
241	35	2	2100	f
242	35	3	2100	f
243	35	4	2100	f
244	35	5	2100	f
245	35	6	2100	f
\.


--
-- Data for Name: daily_nutrition_rollups; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.daily_nutrition_rollups ("logDate", "totalCaloriesKcal", "isFasting", "isLoggingComplete", notes, "updatedAt", "isPartial") FROM stdin;
2026-10-14	2000	f	t	\N	2026-10-14 13:00:20.612	f
2026-09-14	1810	f	t	\N	2026-10-14 07:28:44.088	f
2026-09-15	1700	f	t	\N	2026-10-14 07:28:44.09	f
2026-09-16	1713	f	t	\N	2026-10-14 07:28:44.091	f
2026-09-17	1750	f	t	\N	2026-10-14 07:28:44.092	f
2026-09-19	1900	f	t	\N	2026-10-14 07:28:44.093	f
2026-09-20	1900	f	t	\N	2026-10-14 07:28:44.094	f
2026-09-21	1750	f	t	\N	2026-10-14 07:28:44.095	f
2026-09-22	1800	f	t	\N	2026-10-14 07:28:44.096	f
2026-09-23	1800	f	t	\N	2026-10-14 07:28:44.097	f
2026-09-24	1800	f	t	\N	2026-10-14 07:28:44.098	f
2026-09-25	1800	f	t	\N	2026-10-14 07:28:44.099	f
2026-09-26	3500	f	t	\N	2026-10-14 07:28:44.099	f
2026-09-28	1700	f	t	\N	2026-10-14 07:28:44.101	f
2026-09-30	1900	f	t	\N	2026-10-14 07:28:44.101	f
2026-10-01	2000	f	t	\N	2026-10-14 07:28:44.102	f
2026-10-02	1950	f	t	\N	2026-10-14 07:28:44.103	f
2026-10-05	1650	f	t	\N	2026-10-14 07:28:44.103	f
2026-10-06	1650	f	t	\N	2026-10-14 07:28:44.104	f
\.


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.goals ("goalId", "goalType", "startWeightKg", "targetWeightKg", "weeklyRatePercent", "weeklyRateKg", "startDate", "targetDate", status, "createdAt", "endDate", "etaWeeks", "finalTrendWeightKg", hidden, "initialTrendWeightKg", "scaleReached") FROM stdin;
10	weight_loss	81.1	76	-0.5	0.39	2026-09-14	2026-11-18	abandoned	2026-10-14 07:28:44.086	2026-10-14	6	77.97	f	81.1	f
11	weight_loss	77.97	76	-0.5	0.39	2026-10-14	2026-11-18	active	2026-10-14 08:44:17.823	\N	6	\N	f	77.97	f
\.


--
-- Data for Name: scale_weight_entries; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.scale_weight_entries ("entryId", "logDate", "loggedAt", "weightKg", source, notes, "createdAt") FROM stdin;
216	2026-10-14	2026-10-14 08:00:00	77.8	manual	\N	2026-10-14 07:28:44.106
195	2026-09-14	2026-09-14 08:00:00	81.1	manual	\N	2026-10-14 07:28:44.087
196	2026-09-15	2026-09-15 08:00:00	80.3	manual	\N	2026-10-14 07:28:44.089
197	2026-09-16	2026-09-16 08:00:00	80.5	manual	\N	2026-10-14 07:28:44.091
198	2026-09-17	2026-09-17 08:00:00	81.2	manual	\N	2026-10-14 07:28:44.092
199	2026-09-19	2026-09-19 08:00:00	79.5	manual	\N	2026-10-14 07:28:44.093
200	2026-09-20	2026-09-20 08:00:00	80.2	manual	\N	2026-10-14 07:28:44.093
201	2026-09-21	2026-09-21 08:00:00	80.6	manual	\N	2026-10-14 07:28:44.094
202	2026-09-22	2026-09-22 08:00:00	79.4	manual	\N	2026-10-14 07:28:44.095
203	2026-09-23	2026-09-23 08:00:00	78.7	manual	\N	2026-10-14 07:28:44.096
204	2026-09-24	2026-09-24 08:00:00	79.1	manual	\N	2026-10-14 07:28:44.097
205	2026-09-25	2026-09-25 08:00:00	79.5	manual	\N	2026-10-14 07:28:44.098
206	2026-09-26	2026-09-26 08:00:00	79.1	manual	\N	2026-10-14 07:28:44.099
207	2026-09-27	2026-09-27 08:00:00	79.4	manual	\N	2026-10-14 07:28:44.1
208	2026-09-28	2026-09-28 08:00:00	78.5	manual	\N	2026-10-14 07:28:44.1
209	2026-09-30	2026-09-30 08:00:00	78.8	manual	\N	2026-10-14 07:28:44.101
210	2026-10-01	2026-10-01 08:00:00	78.9	manual	\N	2026-10-14 07:28:44.102
211	2026-10-03	2026-10-03 08:00:00	78.3	manual	\N	2026-10-14 07:28:44.103
212	2026-10-07	2026-10-07 08:00:00	77.8	manual	\N	2026-10-14 07:28:44.104
213	2026-10-10	2026-10-10 08:00:00	77.7	manual	\N	2026-10-14 07:28:44.105
214	2026-10-11	2026-10-11 08:00:00	77.3	manual	\N	2026-10-14 07:28:44.105
215	2026-10-13	2026-10-13 08:00:00	77.8	manual	\N	2026-10-14 07:28:44.105
\.


--
-- Data for Name: tdee_entries; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.tdee_entries ("logDate", "expenditureKcal", status, "tdeeDeltaKcal", "fluxLowerKcal", "fluxUpperKcal", "algorithmVersion", "isManualOverride", "calculatedAt") FROM stdin;
2026-09-14	2335	holding	0	2221	2449	v3	f	2026-10-14 07:28:44.129
2026-09-15	2335	holding	0	2226	2444	v3	f	2026-10-14 07:28:44.131
2026-09-16	2335	holding	0	2244	2426	v3	f	2026-10-14 07:28:44.132
2026-09-17	2328	updating	-7	2281	2375	v3	f	2026-10-14 07:28:44.133
2026-09-18	2321	updating	-7	2274	2368	v3	f	2026-10-14 07:28:44.134
2026-09-19	2317	updating	-4	2267	2367	v3	f	2026-10-14 07:28:44.135
2026-09-20	2313	updating	-4	2266	2360	v3	f	2026-10-14 07:28:44.136
2026-09-21	2308	updating	-5	2262	2354	v3	f	2026-10-14 07:28:44.137
2026-09-22	2304	updating	-4	2256	2352	v3	f	2026-10-14 07:28:44.138
2026-09-23	2302	updating	-2	2250	2354	v3	f	2026-10-14 07:28:44.139
2026-09-24	2303	updating	1	2251	2355	v3	f	2026-10-14 07:28:44.14
2026-09-25	2304	updating	1	2254	2354	v3	f	2026-10-14 07:28:44.141
2026-09-26	2309	updating	5	2259	2359	v3	f	2026-10-14 07:28:44.142
2026-09-27	2314	updating	5	2263	2365	v3	f	2026-10-14 07:28:44.143
2026-09-28	2321	updating	7	2268	2374	v3	f	2026-10-14 07:28:44.144
2026-09-29	2328	updating	7	2272	2384	v3	f	2026-10-14 07:28:44.145
2026-09-30	2333	updating	5	2277	2389	v3	f	2026-10-14 07:28:44.147
2026-10-01	2337	updating	4	2281	2393	v3	f	2026-10-14 07:28:44.148
2026-10-02	2342	updating	5	2286	2398	v3	f	2026-10-14 07:28:44.149
2026-10-03	2348	updating	6	2289	2407	v3	f	2026-10-14 07:28:44.15
2026-10-04	2355	updating	7	2296	2414	v3	f	2026-10-14 07:28:44.151
2026-10-05	2362	updating	7	2302	2422	v3	f	2026-10-14 07:28:44.152
2026-10-06	2368	updating	6	2312	2424	v3	f	2026-10-14 07:28:44.153
2026-10-07	2366	updating	-2	2309	2423	v3	f	2026-10-14 07:28:44.154
2026-10-08	2365	updating	-1	2304	2426	v3	f	2026-10-14 07:28:44.155
2026-10-09	2365	updating	0	2291	2439	v3	f	2026-10-14 07:28:44.156
2026-10-10	2365	updating	0	2292	2438	v3	f	2026-10-14 07:28:44.157
2026-10-11	2364	updating	-1	2289	2439	v3	f	2026-10-14 07:28:44.158
2026-10-12	2360	updating	-4	2265	2455	v3	f	2026-10-14 07:28:44.159
2026-10-13	2360	holding	0	2220	2500	v3	f	2026-10-14 07:28:44.16
2026-10-14	2360	holding	0	2220	2500	v3	f	2026-10-14 07:28:44.161
2026-10-15	2360	holding	0	2220	2500	v3	f	2026-10-14 14:23:07.196
\.


--
-- Data for Name: tdee_overrides; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.tdee_overrides ("overrideId", "startDate", "endDate", "overrideTdeeKcal", reason, "createdAt") FROM stdin;
\.


--
-- Data for Name: user_profile; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.user_profile (id, "biologicalSex", "birthDate", "heightCm", "initialWeightKg", "baselineTdee", "bmrEquation", "checkInDay", "fastCheckIn", "weightUnit", "energyUnit", "trendAlgorithm", "expenditureAlgorithm", "createdAt", "updatedAt") FROM stdin;
1	male	1998-05-15	178	81.1	2335	macrofactor_2024	1	f	kg	kcal	v2_kalman	v3	2026-10-13 13:58:28.995	2026-10-14 13:40:34.512
\.


--
-- Data for Name: weekly_plans; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.weekly_plans ("planId", "goalId", "startDate", "endDate", "checkInDate", "programStyle", "dietStyle", "proteinPrefGPerKg", "tdeeAtCheckin", "weightAtCheckin", "dailyDeficitKcal", "weeklyBudgetKcal", "targetCalories", "isActive", "createdAt") FROM stdin;
31	11	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	78.04	-360	14000	2000	f	2026-10-14 14:23:07.142
10	10	2026-09-14	2026-10-14	2026-10-14	coached	balanced	2	2360	78.04	-429	13517	1931	f	2026-10-14 07:28:44.171
11	10	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 08:26:38.956
12	10	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	77.97	-360	14000	2000	f	2026-10-14 08:26:38.979
13	10	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	77.97	-260	14700	2100	f	2026-10-14 08:26:38.993
14	10	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 08:38:33.274
15	10	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	77.97	-360	14000	2000	f	2026-10-14 08:38:33.298
16	10	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	77.97	-260	14700	2100	f	2026-10-14 08:38:33.314
17	10	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 08:39:10.588
18	10	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	77.97	-360	14000	2000	f	2026-10-14 08:39:10.609
19	10	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	77.97	-260	14700	2100	f	2026-10-14 08:39:10.623
20	10	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 08:41:33.809
21	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 08:44:17.833
22	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	78.04	-429	13517	1931	f	2026-10-14 13:00:33.329
23	11	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	78.04	-360	14000	2000	f	2026-10-14 13:00:33.358
24	11	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	78.04	-260	14700	2100	f	2026-10-14 13:00:33.374
25	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 13:11:05.156
26	11	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	77.97	-360	14000	2000	f	2026-10-14 13:11:05.181
27	11	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	77.97	-260	14700	2100	f	2026-10-14 13:11:05.201
28	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	78.04	-429	13517	1931	f	2026-10-14 13:23:20.498
29	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	78.04	-429	13517	1931	f	2026-10-14 13:40:16.155
30	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	78.04	-429	13517	1931	f	2026-10-14 14:23:07.11
32	11	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	78.04	-260	14700	2100	f	2026-10-14 14:23:07.159
33	11	2026-10-14	2026-10-21	2026-10-14	coached	balanced	2	2360	77.97	-429	13517	1931	f	2026-10-14 14:23:42.727
34	11	2026-10-14	2026-10-21	2026-10-14	collaborative	balanced	2	2360	77.97	-360	14000	2000	f	2026-10-14 14:23:42.755
35	11	2026-10-14	2026-10-21	2026-10-14	manual	balanced	2	2360	77.97	-260	14700	2100	t	2026-10-14 14:23:42.769
\.


--
-- Data for Name: weight_trend_entries; Type: TABLE DATA; Schema: public; Owner: macrofactor
--

COPY public.weight_trend_entries ("logDate", "trendWeightKg", "velocityKgPerDay", "noiseRangeLowerKg", "noiseRangeUpperKg", "algorithmVersion", "calculatedAt") FROM stdin;
2026-09-14	81.1	0	80.9	81.3	v2_kalman	2026-10-14 07:28:44.127
2026-09-15	81	-0.1	80.5	81.5	v2_kalman	2026-10-14 07:28:44.13
2026-09-16	80.93	-0.085	80.4	81.4	v2_kalman	2026-10-14 07:28:44.131
2026-09-17	80.97	-0.043	80.6	81.4	v2_kalman	2026-10-14 07:28:44.132
2026-09-18	80.89	-0.052	80.5	81.3	v2_kalman	2026-10-14 07:28:44.133
2026-09-19	80.71	-0.078	80	81.4	v2_kalman	2026-10-14 07:28:44.135
2026-09-20	80.64	-0.077	80	81.2	v2_kalman	2026-10-14 07:28:44.136
2026-09-21	80.64	-0.066	80	81.2	v2_kalman	2026-10-14 07:28:44.137
2026-09-22	80.47	-0.076	79.8	81.2	v2_kalman	2026-10-14 07:28:44.138
2026-09-23	80.24	-0.099	79.4	81	v2_kalman	2026-10-14 07:28:44.139
2026-09-24	80.1	-0.124	79.3	80.9	v2_kalman	2026-10-14 07:28:44.14
2026-09-25	80.02	-0.124	79.2	80.8	v2_kalman	2026-10-14 07:28:44.141
2026-09-26	79.9	-0.116	79.1	80.7	v2_kalman	2026-10-14 07:28:44.142
2026-09-27	79.83	-0.116	79	80.6	v2_kalman	2026-10-14 07:28:44.143
2026-09-28	79.66	-0.14	78.9	80.5	v2_kalman	2026-10-14 07:28:44.144
2026-09-29	79.53	-0.134	78.7	80.3	v2_kalman	2026-10-14 07:28:44.145
2026-09-30	79.43	-0.116	78.6	80.2	v2_kalman	2026-10-14 07:28:44.146
2026-10-01	79.36	-0.106	78.6	80.2	v2_kalman	2026-10-14 07:28:44.147
2026-10-02	79.27	-0.107	78.5	80.1	v2_kalman	2026-10-14 07:28:44.148
2026-10-03	79.14	-0.109	78.3	79.9	v2_kalman	2026-10-14 07:28:44.149
2026-10-04	79.01	-0.117	78.2	79.8	v2_kalman	2026-10-14 07:28:44.15
2026-10-05	78.89	-0.11	78.1	79.7	v2_kalman	2026-10-14 07:28:44.151
2026-10-06	78.76	-0.11	78	79.6	v2_kalman	2026-10-14 07:28:44.152
2026-10-07	78.64	-0.113	77.8	79.4	v2_kalman	2026-10-14 07:28:44.153
2026-10-08	78.53	-0.119	77.8	79.2	v2_kalman	2026-10-14 07:28:44.154
2026-10-09	78.42	-0.121	77.6	79.2	v2_kalman	2026-10-14 07:28:44.155
2026-10-10	78.33	-0.116	77.5	79.1	v2_kalman	2026-10-14 07:28:44.156
2026-10-11	78.19	-0.117	77.4	79	v2_kalman	2026-10-14 07:28:44.157
2026-10-12	78.11	-0.111	77.4	78.8	v2_kalman	2026-10-14 07:28:44.158
2026-10-13	78.07	-0.099	77.4	78.8	v2_kalman	2026-10-14 07:28:44.159
2026-10-14	78.04	-0.086	77.4	78.6	v2_kalman	2026-10-14 07:28:44.16
2026-10-15	77.97	-0.08	77.4	78.6	v2_kalman	2026-10-14 14:23:07.195
\.


--
-- Name: checkin_history_checkinId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."checkin_history_checkinId_seq"', 1, false);


--
-- Name: daily_macro_targets_targetId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."daily_macro_targets_targetId_seq"', 245, true);


--
-- Name: goals_goalId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."goals_goalId_seq"', 11, true);


--
-- Name: scale_weight_entries_entryId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."scale_weight_entries_entryId_seq"', 226, true);


--
-- Name: tdee_overrides_overrideId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."tdee_overrides_overrideId_seq"', 1, false);


--
-- Name: weekly_plans_planId_seq; Type: SEQUENCE SET; Schema: public; Owner: macrofactor
--

SELECT pg_catalog.setval('public."weekly_plans_planId_seq"', 35, true);


--
-- Name: checkin_history checkin_history_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.checkin_history
    ADD CONSTRAINT checkin_history_pkey PRIMARY KEY ("checkinId");


--
-- Name: daily_macro_targets daily_macro_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.daily_macro_targets
    ADD CONSTRAINT daily_macro_targets_pkey PRIMARY KEY ("targetId");


--
-- Name: daily_nutrition_rollups daily_nutrition_rollups_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.daily_nutrition_rollups
    ADD CONSTRAINT daily_nutrition_rollups_pkey PRIMARY KEY ("logDate");


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY ("goalId");


--
-- Name: scale_weight_entries scale_weight_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.scale_weight_entries
    ADD CONSTRAINT scale_weight_entries_pkey PRIMARY KEY ("entryId");


--
-- Name: tdee_entries tdee_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.tdee_entries
    ADD CONSTRAINT tdee_entries_pkey PRIMARY KEY ("logDate");


--
-- Name: tdee_overrides tdee_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.tdee_overrides
    ADD CONSTRAINT tdee_overrides_pkey PRIMARY KEY ("overrideId");


--
-- Name: user_profile user_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.user_profile
    ADD CONSTRAINT user_profile_pkey PRIMARY KEY (id);


--
-- Name: weekly_plans weekly_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_pkey PRIMARY KEY ("planId");


--
-- Name: weight_trend_entries weight_trend_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.weight_trend_entries
    ADD CONSTRAINT weight_trend_entries_pkey PRIMARY KEY ("logDate");


--
-- Name: daily_macro_targets_planId_dayOfWeek_key; Type: INDEX; Schema: public; Owner: macrofactor
--

CREATE UNIQUE INDEX "daily_macro_targets_planId_dayOfWeek_key" ON public.daily_macro_targets USING btree ("planId", "dayOfWeek");


--
-- Name: scale_weight_entries_logDate_idx; Type: INDEX; Schema: public; Owner: macrofactor
--

CREATE INDEX "scale_weight_entries_logDate_idx" ON public.scale_weight_entries USING btree ("logDate");


--
-- Name: daily_macro_targets daily_macro_targets_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.daily_macro_targets
    ADD CONSTRAINT "daily_macro_targets_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.weekly_plans("planId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: weekly_plans weekly_plans_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macrofactor
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT "weekly_plans_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public.goals("goalId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict AFtsmWdaehBfiRDwpjzbkA0QyR3cQP9isIKDEqhbdvCv76VNW6kNGLfwHH9B7Ux

