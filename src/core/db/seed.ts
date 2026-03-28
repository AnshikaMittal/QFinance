import { db } from './schema';
import { v4 as uuidv4 } from 'uuid';
import type { Category } from '../types';

// ─── Comprehensive US merchant → category keyword mapping ───
// Covers major chains, regional stores, and common credit card statement formats.
// Keywords are matched as case-insensitive substrings against merchant + description.
// Longer keywords win (e.g., "uber eats" beats "uber"), so be specific where it matters.

const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'createdAt'>[] = [
  { name: 'Groceries', icon: 'shopping-cart', color: '#22c55e', keywords: [
    // ── Generic terms ──
    'grocery', 'grocer', 'supermarket', 'food mart', 'fresh market',
    'bazar', 'bazaar', 'farmers market',

    // ── National chains (ONLY here — not in Shopping) ──
    'whole foods', 'trader joe', 'safeway', 'albertsons', 'kroger',
    'walmart', 'costco', 'costco whse', 'costco wholesale',
    'sam\'s club', 'target', 'aldi',
    'publix', 'wegmans', 'meijer', 'winco', 'food lion',
    'stop & shop', 'stop and shop', 'giant eagle', 'giant food',
    'shoprite', 'piggly wiggly', 'bi-lo', 'bilo',
    'harris teeter', 'hannaford', 'food city', 'ingles',

    // ── West Coast / Pacific NW ──
    'qfc', 'fred meyer', 'sprouts', 'vons', 'ralphs', 'stater bros',
    'smart & final', 'grocery outlet', 'winco foods', 'new seasons',
    'metropolitan market', 'uwajimaya', 'central market',

    // ── Midwest ──
    'hy-vee', 'hyvee', 'schnucks', 'jewel-osco', 'jewel osco',
    'woodmans', 'festival foods', 'fareway', 'cub foods',
    'pick n save', 'dillons', 'county market',

    // ── South ──
    'winn-dixie', 'winn dixie', 'h-e-b', 'heb',
    'harvey\'s',

    // ── Northeast ──
    'market basket', 'price chopper',
    'shoppers food', 'acme markets', 'pathmark', 'key food',
    'foodtown', 'fairway market', 'morton williams',

    // ── Asian / International groceries ──
    'h mart', 'hmart', 'ranch 99', '99 ranch', 'mitsuwa',
    'marukai', 'nijiya', 'daiso', 'lotte plaza', 'shun fat',
    'great wall', 'kam man', 'hong kong supermarket',

    // ── Indian / South Asian groceries ──
    'apna bazar', 'patel brothers', 'patel bros', 'indian grocery',
    'raja foods', 'subzi mandi', 'spice bazaar', 'desi basket',
    'namaste plaza', 'india cash & carry', 'bombay bazaar',
    'sri krishna', 'chaat house grocery', 'laxmi',

    // ── Hispanic / Latin groceries ──
    'fiesta mart', 'el super', 'cardenas', 'vallarta', 'la michoacana',
    'northgate', 'rancho', 'sedano\'s', 'bravo supermarket',
    'compare foods', 'mi pueblo', 'food 4 less',

    // ── Grocery delivery ──
    'instacart', 'amazon fresh', 'fresh direct', 'peapod',
    'shipt', 'walmart grocery', 'target grocery', 'costco delivery',

    // ── Wholesale / Club ──
    'bj\'s wholesale', 'bjs wholesale', 'restaurant depot',

    // ── Natural / Organic ──
    'natural grocers', 'earth fare', 'fresh thyme',
    'mom\'s organic',

    // ── Dollar / Discount grocery ──
    'dollar tree', 'dollar general', 'family dollar', 'five below',
    'lidl', 'save a lot', 'save-a-lot',
  ], isDefault: true },

  { name: 'Dining', icon: 'utensils', color: '#f97316', keywords: [
    // ── Generic terms ──
    'restaurant', 'cafe', 'coffee', 'diner', 'bakery', 'grill',
    'eatery', 'bistro', 'pizzeria', 'trattoria', 'cantina',
    'steakhouse', 'bbq', 'barbecue', 'brewpub', 'taproom',
    'food truck', 'food hall', 'food court',

    // ── Delivery / Ordering platforms ──
    'doordash', 'uber eats', 'grubhub', 'postmates', 'seamless',
    'caviar', 'eat24', 'chowbus', 'fantuan',

    // ── Coffee / Cafe chains ──
    'starbucks', 'dunkin', 'peets coffee', 'peet\'s', 'dutch bros',
    'caribou coffee', 'tim hortons', 'philz coffee', 'blue bottle',
    'intelligentsia', 'gregorys coffee', 'la colombe', 'scooters coffee',

    // ── Fast food / QSR national ──
    'mcdonald', 'burger king', 'wendys', 'wendy\'s', 'taco bell',
    'chick-fil-a', 'chickfila', 'popeyes', 'kfc', 'sonic drive',
    'jack in the box', 'whataburger', 'in-n-out', 'in n out',
    'carl\'s jr', 'hardees', 'hardee\'s', 'arby\'s', 'arbys',
    'dairy queen', 'culvers', 'culver\'s', 'raising cane',
    'wingstop', 'buffalo wild wings',
    'white castle', 'rally\'s', 'checkers', 'krystal',
    'church\'s chicken', 'el pollo loco', 'del taco', 'taco john',
    'little caesars', 'papa john', 'domino', 'papa murphy',
    'jersey mike', 'jimmy john', 'firehouse subs',
    'quiznos', 'potbelly', 'schlotzsky', 'jason\'s deli',

    // ── Fast casual / Sit-down chains ──
    'chipotle', 'subway', 'panera', 'five guys', 'panda express',
    'shake shack', 'sweetgreen', 'cava', 'noodles and company',
    'qdoba', 'moe\'s southwest', 'baja fresh', 'rubio\'s',
    'olive garden', 'red lobster', 'longhorn steakhouse', 'outback',
    'applebee', 'chili\'s', 'chilis', 'tgi friday', 'ruby tuesday',
    'cracker barrel', 'bob evans', 'denny\'s', 'dennys', 'ihop',
    'waffle house', 'perkins', 'village inn', 'friendly\'s',
    'cheesecake factory', 'p.f. chang', 'pf changs', 'benihana',
    'red robin', 'texas roadhouse', 'logan\'s roadhouse',
    'twin peaks', 'hooters',
    'yard house', 'bj\'s restaurant',
    'cheddar\'s', 'golden corral', 'ryan\'s', 'sizzler',

    // ── Breakfast / Brunch ──
    'first watch', 'another broken egg', 'broken yolk',
    'original pancake house', 'snooze', 'eggslut',

    // ── Desserts / Sweets ──
    'baskin robbins', 'cold stone', 'marble slab',
    'insomnia cookies', 'crumbl', 'nothing bundt',
    'krispy kreme', 'cinnabon', 'auntie anne',
    'jamba juice', 'jamba', 'smoothie king', 'tropical smoothie',

    // ── Boba / Tea ──
    'kung fu tea', 'gong cha', 'tiger sugar', 'boba guys',
    'share tea', 'ding tea', 'happy lemon',
  ], isDefault: true },

  { name: 'Transport', icon: 'car', color: '#3b82f6', keywords: [
    // ── Rideshare (NOTE: "uber eats" in Dining is longer and wins) ──
    'uber', 'lyft', 'waymo',

    // ── Gas stations national ──
    'shell oil', 'chevron', 'exxon', 'exxonmobil',
    'arco', 'texaco', 'valero', 'sunoco', 'marathon gas',
    'phillips 66', 'conoco', 'citgo', 'murphy usa', 'murphy oil',
    'speedway', 'casey\'s', 'caseys', 'kwik trip', 'kwiktrip',
    'pilot flying j', 'flying j', 'pilot travel', 'loves travel',
    'ta travel center', 'petro stopping',
    'racetrac', 'quiktrip', 'wawa', 'sheetz',
    'buc-ee', 'bucees', 'circle k',
    'costco gas', 'sam\'s club gas', 'kroger fuel', 'safeway fuel',

    // ── Parking ──
    'parking', 'parkwhiz', 'spothero', 'bestparking', 'parkme',
    'laz parking', 'sp+ parking', 'ace parking', 'impark',
    'park jockey', 'propark', 'premium parking',

    // ── Tolls & Transit ──
    'toll', 'e-zpass', 'ezpass', 'fastrak', 'sunpass', 'txtag',
    'good to go', 'peach pass', 'ipass',
    'transit', 'mta ', 'bart ', 'wmata', 'septa',
    'mbta', 'marta', 'trimet', 'sound transit', 'orca card',
    'clipper card', 'metrocard', 'ventra', 'smartrip',

    // ── Car maintenance ──
    'jiffy lube', 'valvoline', 'midas', 'meineke', 'pep boys',
    'firestone auto', 'goodyear auto', 'discount tire', 'tire rack',
    'autozone', 'oreilly auto', 'o\'reilly auto', 'napa auto',
    'advance auto', 'car wash', 'oil change',

    // ── EV charging ──
    'chargepoint', 'electrify america', 'evgo', 'tesla supercharger',
    'blink charging',

    // ── Gas generic ──
    'gas station', 'fuel center', 'petrol',
  ], isDefault: true },

  { name: 'Shopping', icon: 'shopping-bag', color: '#a855f7', keywords: [
    // ── Online retail ──
    // NOTE: "amazon" is here; "amazon prime" is in Subscriptions (longer, wins);
    //       "amazon prime video" is in Entertainment (even longer, wins).
    'amazon', 'amzn', 'amazon.com', 'amazon mktp',
    'ebay', 'etsy', 'wayfair', 'overstock', 'wish.com',
    'shein', 'temu', 'aliexpress', 'alibaba',

    // ── Department stores ──
    'nordstrom', 'macys', 'macy\'s', 'bloomingdale', 'neiman marcus',
    'saks fifth', 'dillard', 'jcpenney', 'jc penney', 'belk',
    'kohl\'s', 'kohls', 'sears', 'von maur', 'lord & taylor',

    // ── Discount / Off-price ──
    'tj maxx', 'tjmaxx', 'marshalls', 'ross', 'burlington',
    'nordstrom rack', 'saks off', 'off 5th', 'century 21',

    // ── Home improvement ──
    'home depot', 'lowes', 'lowe\'s', 'menards', 'ace hardware',
    'harbor freight', 'tractor supply', 'true value',

    // ── Furniture / Home ──
    'ikea', 'pottery barn', 'crate & barrel', 'crate and barrel',
    'restoration hardware', 'west elm',
    'pier 1', 'pier one', 'world market', 'z gallerie',
    'rooms to go', 'ashley furniture', 'ethan allen',
    'bed bath', 'williams sonoma', 'sur la table',

    // ── Electronics ──
    'best buy', 'apple store', 'apple.com', 'micro center',
    'b&h photo', 'bh photo', 'newegg', 'adorama',
    'gamestop', 'game stop',

    // ── Apparel / Fashion ──
    'nike', 'adidas', 'under armour', 'lululemon', 'athleta',
    'old navy', 'banana republic', 'j.crew', 'jcrew',
    'uniqlo', 'zara', 'h&m', 'forever 21', 'aeropostale',
    'american eagle', 'hollister', 'abercrombie',
    'urban outfitters', 'anthropologie', 'free people',
    'express fashion', 'ann taylor', 'loft',
    'talbots', 'chico\'s', 'white house black market',
    'brooks brothers', 'vineyard vines', 'tommy hilfiger',
    'ralph lauren', 'calvin klein', 'michael kors', 'coach outlet',
    'kate spade', 'tory burch', 'gucci', 'louis vuitton',
    'foot locker', 'finish line', 'dick\'s sporting', 'dicks sporting',
    'rei co-op', 'patagonia', 'north face',
    'columbia sportswear',

    // ── Beauty / Personal care stores ──
    'sephora', 'ulta', 'bath & body', 'bath and body',
    'sally beauty', 'bluemercury', 'the body shop',

    // ── Pet stores ──
    'petco', 'petsmart', 'chewy', 'pet supplies plus',
    'pet valu', 'hollywood feed',

    // ── Office / Craft ──
    'staples', 'office depot', 'officemax',
    'michaels', 'hobby lobby', 'joann', 'jo-ann',

    // ── Misc retail ──
    'big lots', 'tuesday morning',
    'container store', 'brookstone',
  ], isDefault: true },

  { name: 'Entertainment', icon: 'film', color: '#ec4899', keywords: [
    // ── Streaming ──
    'netflix', 'spotify', 'hulu', 'disney+', 'disney plus',
    'hbo max', 'max.com', 'peacock', 'paramount+', 'paramount plus',
    'apple tv', 'apple music', 'youtube premium', 'youtube music',
    'amazon prime video', 'discovery+', 'discovery plus',
    'crunchyroll', 'funimation', 'mubi', 'criterion',
    'tidal', 'pandora', 'deezer', 'audible', 'kindle unlimited',
    'siriusxm', 'sirius xm',

    // ── Movie theaters ──
    'cinema', 'cinemark', 'amc theater', 'amc entertainment',
    'regal cinema', 'regal entertainment', 'fandango',
    'marcus theatres', 'harkins', 'landmark theatres',
    'angelika', 'alamo drafthouse',

    // ── Gaming (removed generic "game" — too short, false-matches gamestop etc.) ──
    'steam store', 'valve software', 'playstation', 'psn ',
    'xbox', 'microsoft xbox',
    'nintendo', 'epic games', 'riot games', 'blizzard',
    'ea.com', 'electronic arts', 'activision', 'ubisoft',
    'twitch', 'roblox',

    // ── Live entertainment ──
    'ticketmaster', 'stubhub', 'seatgeek', 'vivid seats',
    'axs.com', 'eventbrite', 'livenation', 'live nation',
    'concert', 'broadway', 'comedy club',

    // ── Attractions / Theme parks ──
    'disneyland', 'disney world', 'universal studios',
    'six flags', 'cedar point', 'seaworld', 'legoland',
    'aquarium', 'museum', 'bowling alley',
    'dave and buster', 'dave & buster', 'topgolf', 'main event',
    'skyzone', 'urban air', 'trampoline park',
    'escape room', 'laser tag', 'miniature golf', 'mini golf',
    'go kart', 'arcade',

    // ── Sports tickets ──
    'nba ticket', 'nfl ticket', 'mlb ticket', 'nhl ticket',
  ], isDefault: true },

  { name: 'Bills & Utilities', icon: 'zap', color: '#eab308', keywords: [
    // ── Generic ──
    'electric bill', 'water bill', 'sewer', 'trash bill', 'waste management',
    'internet bill', 'phone bill', 'cell phone bill', 'wireless bill',
    'cable bill', 'satellite', 'insurance', 'rent payment', 'mortgage',
    'hoa ', 'homeowners assoc', 'property tax',

    // ── Electricity / Gas utilities ──
    'pg&e', 'pacific gas', 'con edison', 'coned', 'duke energy',
    'dominion energy', 'southern company', 'entergy',
    'xcel energy', 'dte energy', 'consumers energy',
    'ameren', 'eversource', 'national grid',
    'ppl electric', 'pepco', 'centerpoint energy',
    'pacific power', 'puget sound energy',
    'seattle city light', 'snohomish pud', 'tacoma utilities',
    'socal edison', 'sdge', 'ladwp',
    'florida power', 'georgia power', 'alabama power',

    // ── Internet / Cable / Phone ──
    'comcast', 'xfinity', 'at&t', 'spectrum',
    'verizon wireless', 'verizon fios', 't-mobile', 'tmobile',
    'cox communications', 'frontier comm', 'centurylink', 'lumen',
    'optimum', 'altice', 'windstream', 'mediacom',
    'google fiber', 'mint mobile', 'cricket wireless',
    'boost mobile', 'straight talk', 'us cellular',
    'dish network', 'directv',

    // ── Insurance (removed "kaiser" — it's in Health as "kaiser permanente") ──
    'state farm', 'geico', 'progressive insurance', 'allstate', 'usaa',
    'liberty mutual', 'nationwide', 'farmers insurance',
    'travelers ins', 'erie insurance', 'american family ins',
    'amica', 'auto-owners', 'shelter insurance',
    'metlife', 'prudential', 'aetna', 'cigna', 'humana',
    'anthem', 'blue cross', 'blue shield', 'united healthcare',
    'molina healthcare',

    // ── Rent / Mortgage ──
    'zelle rent', 'venmo rent',
    'wells fargo mortgage', 'chase mortgage', 'rocket mortgage',
    'loan payment', 'student loan', 'navient', 'nelnet',
    'sallie mae', 'great lakes', 'mohela', 'aidvantage',
    'fedloan', 'sofi loan', 'earnest', 'commonbond',

    // ── Misc bills ──
    'adt security', 'ring protect', 'simplisafe',
    'vivint', 'brinks home',
  ], isDefault: true },

  { name: 'Health', icon: 'heart', color: '#ef4444', keywords: [
    // ── Pharmacies ──
    'pharmacy', 'cvs', 'walgreens', 'rite aid', 'duane reade',
    'costco pharmacy', 'walmart pharmacy', 'kroger pharmacy',
    'publix pharmacy', 'heb pharmacy', 'safeway pharmacy',
    'good rx', 'goodrx', 'capsule pharmacy', 'alto pharmacy',
    'express scripts', 'optum rx', 'caremark',

    // ── Medical providers ──
    'doctor', 'hospital', 'medical center', 'medical group',
    'urgent care', 'minute clinic', 'walk-in clinic',
    'one medical', 'zocdoc', 'teladoc', 'mdlive',
    'kaiser permanente', 'cleveland clinic', 'mayo clinic',
    'quest diagnostic', 'lab corp', 'labcorp',
    'imaging center', 'radiology', 'pathology',

    // ── Dental ──
    'dental', 'dentist', 'orthodont', 'invisalign',
    'aspen dental', 'western dental', 'pacific dental',

    // ── Vision ──
    'optom', 'optician', 'lenscrafters', 'pearle vision',
    'visionworks', 'warby parker', 'eye care', 'ophthalmol',
    'america\'s best', 'eyeglass world', '1-800 contacts',

    // ── Mental health ──
    'therapist', 'counselor', 'psychiatr',
    'betterhelp', 'talkspace', 'cerebral',

    // ── Gym / Fitness ──
    'planet fitness', 'la fitness',
    'anytime fitness', 'equinox', 'lifetime fitness',
    'orangetheory', 'orange theory', 'crossfit',
    '24 hour fitness', 'crunch fitness', 'gold\'s gym', 'golds gym',
    'barre3', 'pure barre', 'soulcycle', 'peloton',
    'ymca', 'ywca', 'classpass',

    // ── Wellness ──
    'massage envy', 'massage therapy', 'chiropractic', 'acupuncture',
    'hand and stone', 'elements massage',
  ], isDefault: true },

  { name: 'Subscriptions', icon: 'repeat', color: '#06b6d4', keywords: [
    // ── Generic ──
    'subscription', 'membership', 'annual fee', 'monthly fee',
    'recurring', 'renewal',

    // ── Software / SaaS ──
    'adobe', 'microsoft 365', 'office 365', 'google one',
    'google workspace', 'icloud', 'apple one',
    'dropbox', 'box.com', 'evernote', 'notion',
    'chatgpt', 'openai', 'claude', 'anthropic',
    'github', 'gitlab', 'jetbrains', 'figma',
    'canva', 'grammarly', 'lastpass', '1password', 'bitwarden',
    'nordvpn', 'expressvpn', 'surfshark', 'proton',
    'dashlane', 'lifelock', 'norton', 'mcafee', 'malwarebytes',
    'zoom', 'slack', 'trello', 'asana', 'monday.com',

    // ── News / Media ──
    'new york times', 'nytimes', 'washington post', 'wall street journal',
    'wsj', 'the athletic', 'medium', 'substack',
    'economist', 'bloomberg', 'reuters',

    // ── Meal kits / Recurring delivery ──
    'blue apron', 'hellofresh', 'home chef', 'factor meals',
    'daily harvest', 'freshly', 'butcherbox', 'hungryroot',
    'imperfect foods', 'misfits market', 'thrive market',

    // ── Misc subscriptions ──
    'patreon', 'onlyfans', 'twitch sub',
    'amazon prime', 'prime membership',
    'costco membership', 'costco annual',
    'sam\'s club member', 'aaa membership',
    'dollar shave', 'harry\'s', 'birchbox', 'ipsy', 'fabfitfun',
    'stitch fix', 'rent the runway', 'bark box', 'barkbox',
  ], isDefault: true },

  { name: 'Travel', icon: 'plane', color: '#14b8a6', keywords: [
    // ── Airlines ──
    'airline', 'flight', 'american airlines', 'delta air', 'united air',
    'southwest air', 'jetblue', 'spirit air', 'frontier air',
    'alaska air', 'hawaiian air', 'allegiant', 'sun country',
    'air canada', 'british airways', 'lufthansa', 'emirates',
    'qatar airways', 'singapore air', 'cathay pacific',
    'korean air', 'japan airlines', 'ana airlines', 'air france', 'klm',
    'turkish air', 'virgin atlantic', 'icelandair',
    'ryan air', 'easyjet', 'wizz air',

    // ── Booking platforms ──
    'expedia', 'booking.com', 'hotels.com', 'kayak', 'priceline',
    'orbitz', 'travelocity', 'hopper', 'google flights',
    'skyscanner', 'momondo', 'kiwi.com', 'cheapoair',
    'tripadvisor', 'trip.com',

    // ── Hotels / Lodging ──
    'hotel', 'motel', 'resort', 'inn ', 'lodge',
    'marriott', 'hilton', 'hyatt', 'ihg', 'intercontinental',
    'holiday inn', 'hampton inn', 'courtyard by marriott',
    'fairfield inn', 'residence inn', 'springhill suites',
    'doubletree', 'embassy suites', 'homewood suites',
    'best western', 'wyndham', 'la quinta', 'radisson',
    'sheraton', 'westin', 'st regis', 'ritz carlton',
    'four seasons', 'omni hotel', 'kimpton',
    'airbnb', 'vrbo', 'vacasa', 'turnkey', 'evolve',

    // ── Rental cars ──
    'rental car', 'hertz', 'enterprise rent', 'avis', 'budget rent',
    'national car', 'alamo rent', 'sixt', 'thrifty', 'dollar rent',
    'zipcar', 'turo',

    // ── Airport / Travel misc ──
    'tsa', 'global entry', 'clear', 'priority pass',
    'airport', 'duty free', 'cruise', 'amtrak', 'greyhound',
    'flixbus', 'megabus',
  ], isDefault: true },

  { name: 'Education', icon: 'book-open', color: '#8b5cf6', keywords: [
    // ── Generic ──
    'tuition', 'course', 'school', 'university', 'college',
    'education', 'academic', 'semester', 'textbook',

    // ── Online learning ──
    'udemy', 'coursera', 'linkedin learning', 'skillshare',
    'masterclass', 'pluralsight', 'datacamp', 'codecademy',
    'khan academy', 'brilliant', 'duolingo', 'babbel',
    'edx', 'udacity', 'treehouse', 'educative',
    'oreilly learning', 'safari books',
    'wondrium', 'great courses', 'the great courses',

    // ── Books ──
    'book', 'bookstore', 'barnes & noble', 'barnes and noble',
    'books-a-million', 'half price books', 'powell\'s',
    'amazon kindle', 'kindle', 'scribd',

    // ── Test prep ──
    'kaplan', 'princeton review', 'magoosh', 'chegg',
    'study.com', 'quizlet',

    // ── Tutoring ──
    'tutor', 'kumon', 'sylvan', 'mathnasium', 'wyzant',
    'varsity tutors',

    // ── Student services ──
    'student', 'bursar', 'registrar', 'financial aid',
    'campus', 'dormitory',
  ], isDefault: true },

  { name: 'Income', icon: 'dollar-sign', color: '#10b981', keywords: [
    // ── Payroll / Employment ──
    'payroll', 'deposit', 'salary', 'direct dep', 'paycheck',
    'adp payroll', 'gusto', 'paychex', 'workday',
    'employer', 'compensation', 'stipend', 'bonus',

    // ── Refunds / Credits ──
    'refund', 'cashback', 'cash back', 'credit adjustment',
    'price adjustment', 'return credit', 'merchandise credit',
    'rebate', 'reimbursement',

    // ── Card payments ──
    'payment thank you', 'automatic payment', 'autopay',
    'online payment', 'mobile payment',

    // ── Rewards ──
    'rewards', 'reward redemp', 'points redemption',
    'statement credit', 'promotional credit',
    'interest earned', 'interest payment',

    // ── Transfers ──
    'zelle from', 'venmo from', 'paypal from',
    'transfer from', 'ach credit',

    // ── Government ──
    'irs treas', 'tax refund', 'social security', 'ssi',
    'unemployment', 'edd benefit',
  ], isDefault: true },

  { name: 'Other', icon: 'more-horizontal', color: '#6b7280', keywords: [], isDefault: true },
];

export async function seedDefaultCategories(): Promise<void> {
  const existing = await db.categories.toArray();

  if (existing.length === 0) {
    // First time — create all defaults
    const categories: Category[] = DEFAULT_CATEGORIES.map((cat) => ({
      ...cat,
      id: uuidv4(),
      createdAt: new Date(),
    }));
    await db.categories.bulkAdd(categories);
    return;
  }

  // Update existing default categories with expanded keywords
  for (const defaults of DEFAULT_CATEGORIES) {
    const match = existing.find((e) => e.name === defaults.name && e.isDefault);
    if (match && defaults.keywords.length > match.keywords.length) {
      // Merge: keep any user-added keywords, add new defaults
      const merged = [...new Set([...match.keywords, ...defaults.keywords])];
      await db.categories.update(match.id, { keywords: merged });
    }
  }
}
