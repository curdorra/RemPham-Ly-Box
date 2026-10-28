/** UI strings in English and Mizo. Mizo is a first draft — have a native speaker review. */
export type Lang = "en" | "lus";
export const LANG_COOKIE = "rlb_lang";

const en = {
  navHome: "Home", navOpening: "Opening Night", navCinema: "At the Cinema", navSnacks: "Snacks", navBoxOffice: "Box Office",
  myTickets: "My Tickets", signIn: "Sign in", signUp: "Create account", signOut: "Sign out", search: "Search",
  searchPlaceholder: "Films, series, people, genres",
  nowShowing: "Now showing", openingNight: "Opening night", trailer: "Trailer", book: "Book", prebook: "Pre-book",
  watch: "Watch now", viewTicket: "View ticket", moreInfo: "More info", myList: "My List", added: "In My List",
  hours48: "Buy a ticket, press play any time — the window starts when you do.",
  whosWatching: "Who's watching?", manageProfiles: "Manage profiles", addProfile: "Add profile", kids: "Kids",
  moreLikeThis: "More like this", episodes: "Episodes", cast: "Cast", directors: "Directed by",
  rateNo: "Not for me", rateYes: "I like this", rateLove: "Love this!",
  standard: "Standard", together: "Watch together", togetherPerks: "screens at once, in sync — invite family anywhere",
  standardPerks: "1 screen", comingSoon: "Coming soon", hoursToFinish: "hours to finish", tickets: "Tickets", extrasGift: "Extras become gift codes",
  combo: "Add a snack combo", comboSub: "Butter popcorn + 2 cold drinks, delivered", total: "Total", pay: "Pay",
  withUpi: "with UPI", devPay: "Dev payments: no money is taken.", processing: "Processing…",
  paid: "You're in.", paidSub: "Your ticket is ready. The clock starts when you press play.", close: "Close",
  seat: "Seat", yourSeat: "Your seat", pickSeat: "Pick your seat", screen: "SCREEN", available: "Available", taken: "Taken",
  seatsLeft: "seats left", tapSeat: "Tap a seat", tapSeatSub: "Your seat is your place in the live hall",
  everyoneTogether: "Everyone presses play together", openingSub: "Opening nights are live: one start time, the whole audience at once. Afterwards the film joins the programme.",
  remind: "Remind me", reminded: "We'll remind you", days: "days", hrs: "hours", mins: "min", secs: "sec",
  cinemaTitle: "On the big screen", cinemaSub: "Showtimes at RemPhamLy Cinema, Aizawl. Booking opens on BookMyShow.",
  bookOnBms: "Book on BookMyShow", noShows: "No shows listed for this day yet.", watchAtHome: "Watch at home",
  today: "Today", tomorrow: "Tomorrow",
  snacksTitle: "Snacks, delivered before the show", snacksSub: "Made by local partner kitchens, timed to your showtime.",
  yourOrder: "Your order", nothingYet: "Nothing yet.", add: "Add", placeOrder: "Place order", address: "Delivery address", phone: "Phone",
  deliverNow: "As soon as possible", deliverAt: "Deliver at", orderPlaced: "Order placed — the kitchen has it.",
  boxOfficeTitle: "This week's box office", boxOfficeSub: "Tickets sold, updated live.", ticketsWord: "tickets",
  resultsFor: "Results for", didYouMean: "Did you mean", people: "People", nothingFound: "Nothing matched.",
  lightsDown: "The lights are going down…", enjoy: "Please enjoy the film", skipIntro: "Skip intro", nextEpisode: "Next episode",
  liveNow: "Live · Opening night", back: "Back", subtitles: "Subtitles", subsOff: "Off",
  yourTickets: "Your tickets", noTickets: "No tickets yet.", giftsToShare: "Tickets to gift", redeem: "Redeem",
  giftCode: "Got a gift code?", validFor: "Valid", screens: "Screens", paidL: "Paid", booking: "Booking", anyTime: "Any time",
  showAtCinema: "Show at the cinema & for snack pickup",
  where: "Where", atHome: "At home, any time",
} as const;

export type Key = keyof typeof en;

const lus: Record<Key, string> = {
  ...en,
  navHome: "In", navOpening: "Chhuah Ṭanna Zan", navCinema: "Cinema-ah", navSnacks: "Snacks", navBoxOffice: "Box Office",
  myTickets: "Ka Ticket", signIn: "Lut rawh", signUp: "Account siam rawh", signOut: "Chhuak rawh", search: "Zawng rawh",
  searchPlaceholder: "Film, series, mi, chi hrang hrang",
  nowShowing: "Tunah lang mek", openingNight: "Chhuah ṭanna zan", book: "Lei rawh", prebook: "Hma takin lei",
  watch: "Tunah en rawh", viewTicket: "Ticket en rawh", moreInfo: "Hriatna dang", added: "Ka List-ah a awm",
  whosWatching: "Tu nge en ang?", manageProfiles: "Profile enkawl rawh", addProfile: "Profile belh rawh", kids: "Naupang",
  moreLikeThis: "A ang chi dang", cast: "Chang", directors: "Director",
  rateNo: "Ka duh lo", rateYes: "Ka duh", rateLove: "Ka duh em em!",
  together: "En ho rawh", togetherPerks: "screen vawikhatah — chhungte engtah pawh sawm", hoursToFinish: "darkar chhunga en zawh tur",
  tickets: "Ticket zat", extrasGift: "A belh chu gift code a ni ang", combo: "Snack combo belh rawh", total: "A vaiin", pay: "Pe rawh",
  withUpi: "UPI hmangin", processing: "A kal mek…", paid: "I lut thei ta.", paidSub: "I ticket a inpeih tawh. Play i hmeh veleh hun a ṭan ang.", close: "Khar rawh",
  yourSeat: "I seat", pickSeat: "I seat thlang rawh", available: "A awl", taken: "Luah tawh", seatsLeft: "seat a la awl",
  tapSeat: "Seat hmet rawh", everyoneTogether: "Mi zawng zawngin vawikhatah an en ho",
  remind: "Min hriattir rawh", reminded: "Kan hriattir ang che", days: "ni", hrs: "darkar",
  cinemaTitle: "Screen lianah", cinemaSub: "RemPhamLy Cinema, Aizawl-a show hun. BookMyShow-ah lei rawh.",
  bookOnBms: "BookMyShow-ah lei rawh", noShows: "He ni atan show a la awm lo.", watchAtHome: "In-ah en rawh",
  today: "Vawiin", tomorrow: "Naktuk",
  snacksTitle: "Film ṭan hmain snacks", yourOrder: "I order", nothingYet: "Engmah a la awm lo.", add: "Belh", placeOrder: "Order rawh",
  address: "Thlen na tur", deliverNow: "Theih chang berin", deliverAt: "Hun ruat", orderPlaced: "Order a lut ta.",
  boxOfficeTitle: "Kar khata box office", ticketsWord: "ticket",
  resultsFor: "Zawn chhuah", didYouMean: "I sawi duh chu", people: "Mi", nothingFound: "Engmah a awm lo.",
  lightsDown: "Êng a thim ta…", enjoy: "Film nuam takin en rawh", back: "Kîr leh", subtitles: "Subtitle", subsOff: "Awm lo",
  where: "Khawiah", atHome: "In-ah, engtik pawh",
  yourTickets: "I ticket-te", noTickets: "Ticket i la nei lo.", giftsToShare: "Pek tur ticket", redeem: "Lak rawh", giftCode: "Gift code i nei em?",
};

const DICTS: Record<Lang, Record<Key, string>> = { en, lus };

export function translator(lang: Lang) {
  return (key: Key) => DICTS[lang][key];
}

export const parseLang = (v: string | undefined): Lang => (v === "lus" ? "lus" : "en");
