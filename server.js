// Obejście błędu querySrv ECONNREFUSED dla Windowsa (Wymuszamy Google DNS)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const User = require('./models/User');
const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// Importujemy nasz model/schemat piwa, który przed chwilą stworzyłeś
const Beer = require('./models/Beer');

const app = express();

// Włączamy obsługę CORS i czytania formatu JSON
app.use(cors());
app.use(express.json());

// NOWOŚĆ: Udostępniamy folder 'uploads' całemu światu (telefon będzie stąd pobierał zdjęcia przez link URL)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------------------------------------------------------------
// KONFIGURACJA MULTERA (ZAPIS ZDJĘĆ Z TELEFONU)
// -------------------------------------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Zdjęcia lecą do folderu uploads
  },
  filename: function (req, file, cb) {
    // Nadajemy unikalną nazwę pliku: data_kliknięcia + oryginalne rozszerzenie (np. .jpg)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// -------------------------------------------------------------
// POŁĄCZENIE Z BAZĄ DANYCH
// -------------------------------------------------------------
mongoose.connect(process.env.MONGO_URI, { connectTimeoutMS: 5000 })
  .then(() => console.log('🚀 Połączono z bazą danych MongoDB Atlas pomyślnie!'))
  .catch(err => console.error('❌ Błąd połączenia z bazą danych:', err));

// -------------------------------------------------------------
// TRASY BACKENDOWE (ENDPOINTS)
// -------------------------------------------------------------

// Testowa trasa główna
app.get('/', (req, res) => {
  
  res.send('Serwer aplikacji BROSY działa prawidłowo!');
});
// -------------------------------------------------------------
// TRASY UWIERZYTELNIANIA (REJESTRACJA I LOGOWANIE)
// -------------------------------------------------------------

// 1. REJESTRACJA: Zakładanie nowego konta
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Sprawdzamy, czy użytkownik o takim e-mailu już istnieje w bazie
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "Ten adres e-mail jest już zarejestrowany!" });
    }

    // Bezpieczne szyfrowanie (hashowanie) hasła użytkownika
    const salt = await bcrypt.genSalt(6);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tworzymy nowego użytkownika w bazie MongoDB Atlas
    const newUser = new User({
      email,
      username,
      password: hashedPassword // Zapisujemy bezpieczne, zaszyfrowane hasło!
    });

    await newUser.save();
    res.status(201).json({ success: true, message: "Konto zostało utworzone pomyślnie!" });

  } catch (error) {
    console.error("❌ Błąd podczas rejestracji:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas rejestracji." });
  }
});

// 2. LOGOWANIE: Sprawdzanie danych i wpuszczanie do aplikacji
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Szukamy użytkownika w bazie po adresie e-mail
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Nieprawidłowy e-mail lub hasło!" });
    }

    // Porównujemy wpisane hasło z zaszyfrowanym hasłem z bazy danych
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Nieprawidłowy e-mail lub hasło!" });
    }

    // Jeśli wszystko się zgadza, odsyłamy do telefonu sukces, ID użytkownika oraz jego nazwę
    res.status(200).json({
      success: true,
      message: "Zalogowano pomyślnie!",
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error("❌ Błąd podczas logowania:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas logowania." });
  }
});

// TRASA: Dodawanie nowej oceny piwa (Odbiera tekst + plik graficzny)
// upload.single('beerImage') oznacza, że telefon wyśle zdjęcie w polu o nazwie 'beerImage'
// BEZPIECZNA TRASA JSON DLA VERCEL (Zachowuje Twoją inteligentną logikę aktualizacji ocen!)
app.post('/api/beers', async (req, res) => {
  try {
    // 1. Odbieramy dane tekstowe wysłane z telefonu jako JSON (w tym link z Cloudinary)
    const { userId, name, alcohol, volume, price, rating, description, beerImage } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Brak identyfikatora użytkownika." });
    }

    // Wyciągamy dane do inteligentnego sprawdzenia
    const cleanName = name.trim();
    const parsedAlcohol = parseFloat(alcohol);
    const parsedVolume = parseInt(volume);

    // SZUKAMY: Czy TEN konkretny użytkownik oceniał już piwo o TEJ samej nazwie, % i pojemności?
    const existingBeer = await Beer.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      name: { $regex: new RegExp(`^${cleanName}$`, 'i') },
      alcohol: parsedAlcohol,
      volume: parsedVolume
    });

    if (existingBeer) {
      // 🔄 AKTUALIZACJA: Jeśli piwo już istnieje, podmieniamy dane na nowe!
      existingBeer.rating = parseInt(rating);
      existingBeer.price = parseFloat(price);
      existingBeer.description = description;
      
      // Zdjęcie z Cloudinary aktualizujemy tylko, jeśli użytkownik zrobił nowe
      if (beerImage) {
        existingBeer.image = beerImage;
      }
      
      existingBeer.createdAt = Date.now(); // odświeżamy datę na najnowszą

      const updatedBeer = await existingBeer.save();
      return res.status(200).json({ 
        success: true, 
        message: "Twoja poprzednia ocena tego piwa została zaktualizowana!", 
        data: updatedBeer 
      });
    }

    // ➕ WPIS: Jeśli użytkownik ocenia to piwo pierwszy raz w życiu, tworzymy nowy dokument
    const newBeer = new Beer({
      userId,
      name: cleanName,
      alcohol: parsedAlcohol,
      volume: parsedVolume,
      price: parseFloat(price),
      rating: parseInt(rating),
      description,
      image: beerImage || "" // <-- Zapisujemy bezpieczny link, który przyszedł z telefonu!
    });

    const savedBeer = await newBeer.save();
    res.status(201).json({ success: true, message: "Pomyślnie zapisano nową ocenę w chmurze!", data: savedBeer });

  } catch (error) {
    console.error("❌ Błąd podczas zapisu/aktualizacji piwa:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera." });
  }
});
// -------------------------------------------------------------
// NOWA TRASA: Pobieranie wszystkich ocenionych piw z bazy
// -------------------------------------------------------------
app.get('/api/beers', async (req, res) => {
  try {
     const { userId } = req.query; // Serwer odbiera ID zalogowanej osoby

    if (!userId) {
      return res.status(400).json({ success: false, message: "Brak identyfikatora użytkownika." });
    }
    // .find() wyciąga wszystkie dokumenty z bazy MongoDB Atlas
    // .sort({ createdAt: -1 }) układa je automatycznie od najnowszego do najstarszego (chronologicznie)
    const beers = await Beer.find().sort({ createdAt: -1 });
    
    // Odsyłamy pobraną listę piw prosto do telefonu w formacie JSON
    res.status(200).json(beers);
  } catch (error) {
    console.error("❌ Błąd podczas pobierania piw z bazy:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas wczytywania." });
  }
});
// -------------------------------------------------------------
// NOWA TRASA: Generowanie automatycznego globalnego rankingu
// -------------------------------------------------------------
app.get('/api/ranking', async (req, res) => {
  try {
    // Agregacja grupuje wszystkie oceny piw z bazy danych
    const ranking = await Beer.aggregate([
      {
        $group: {
         _id: { $trim: { input: { $toLower: "$name" } } }, // Grupujemy po nazwie piwa (zmieniamy na małe litery, żeby "Żubr" i "żubr" to było jedno)
          realName: { $first: "$name" }, // Zapamiętujemy ładną, oryginalną nazwę piwa
          alcohol: { $first: "$alcohol" }, // Bierzemy procent alkoholu
          volume: { $first: "$volume" }, // Bierzemy pojemność
          price: { $avg: "$price" }, // Liczymy automatyczną ŚREDNIĄ cenę z rynku
          rating: { $avg: "$rating" }, // Liczymy automatyczną ŚREDNIĄ ocenę piwa!
          reviewsCount: { $count: {} } // Zliczamy ile razy to piwo zostało ocenione w systemie
        }
      },
      {
        // Żeby ranking miał format spójny z frontendem, mapujemy pola na ładne nazwy
        $project: {
          _id: 0,
          id: "$realName", // Jako ID tymczasowo używamy nazwy, żeby FlatList miał unikalny klucz
          name: "$realName",
          alcohol: "$alcohol",
          volume: "$volume",
          price: "$price",
          rating: "$rating",
          reviewsCount: "$reviewsCount"
        }
      }
    ]);

    // Domyślnie na tym etapie zwracamy surową listę z bazy, telefon zajmie się jej sortowaniem i suwakami!
    res.status(200).json(ranking);
  } catch (error) {
    console.error("❌ Błąd podczas generowania rankingu:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas ładowania rankingu." });
  }
});
// -------------------------------------------------------------
// NOWA TRASA: Dane do profilu użytkownika (Statystyki i TOP 5 dla konkretnego USERA)
// -------------------------------------------------------------
app.get('/api/profile-stats', async (req, res) => {
  try {
    const { userId } = req.query; // Serwer odbiera ID zalogowanej osoby z telefonu przez ?userId=...

    if (!userId) {
      return res.status(400).json({ success: false, message: "Brak identyfikatora użytkownika." });
    }

    // 1. Liczymy statystyki w bazie MongoDB – TYLKO dla tego konkretnego zalogowanego użytkownika!
    const totalBeers = await Beer.countDocuments({ userId });
    
    // Liczymy mocne piwa dla tego usera
    const strongBeersCount = await Beer.countDocuments({ 
      userId,
      $or: [ { alcohol: { $gt: 7.0 } }, { alcohol: { $gt: "7.0" } } ] 
    });
    
    // Liczymy piwa 0% dla tego usera
    const alcoholFreeCount = await Beer.countDocuments({ 
      userId,
      $or: [ { alcohol: 0.0 }, { alcohol: "0.0" }, { alcohol: 0 } ] 
    });
    
    // Liczymy długie opisy dla tego usera
    const longDescriptionsCount = await Beer.countDocuments({
      userId,
      description: { $exists: true },
      $expr: { $gt: [{ $strLenCP: "$description" }, 20] }
    });

    // 2. Pobieramy TOP 5 piw najwyżej ocenionych przez TEGO konkretnego usera
    const topBeers = await Beer.find({ userId }).sort({ rating: -1 }).limit(5);

    // Mapujemy topkę na format dla telefonu
    const topFiveMapped = topBeers.map(beer => ({
      id: beer._id.toString(),
      name: beer.name,
      rating: beer.rating,
      specs: `${beer.alcohol ? Number(beer.alcohol).toFixed(1) : "0.0"}% | ${beer.volume}ml | ${beer.price ? Number(beer.price).toFixed(2) : "0.00"} zł`
    }));

    // 🚀 POPRAWKA: Odsyłamy do telefonu PEŁNĄ paczkę danych wraz ze wszystkimi licznikami odznak!
    res.status(200).json({
      totalBeers,
      strongBeersCount,
      alcoholFreeCount,
      longDescriptionsCount,
      topFiveBeers: topFiveMapped
    });

  } catch (error) {
    console.error("❌ Błąd podczas ładowania statystyk profilu:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas ładowania profilu." });
  }
});

// -------------------------------------------------------------
// NOWA TRASA: Bezpowrotne usuwanie konkretnej oceny piwa z bazy
// -------------------------------------------------------------
app.delete('/api/beers/:id', async (req, res) => {
  try {
    const { id } = req.params; // Odbieramy ID piwa przekazane na końcu linku
    
    // Szukamy dokumentu w MongoDB i bezpowrotnie go kasujemy
    const deletedBeer = await Beer.findByIdAndDelete(id);
    
    if (!deletedBeer) {
      return res.status(404).json({ success: false, message: "Nie znaleziono takiego piwa w bazie." });
    }

    res.status(200).json({ success: true, message: "Ocena została pomyślnie usunięta z chmury!" });
  } catch (error) {
    console.error("❌ Błąd podczas usuwania piwa:", error);
    res.status(500).json({ success: false, message: "Wystąpił błąd serwera podczas usuwania." });
  }
});
// Uruchomienie serwera na porcie 5000
const PORT = process.env.PORT || 5000;

// OSTATECZNE, CZYSTE POŁĄCZENIE: Bez zbędnych opcji, które wywalają błędy w nowym Node!
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("🌱 Połączono pomyślnie z MongoDB Atlas w chmurze!"))
.catch(err => console.error("❌ Błąd krytyczny połączenia z bazą:", err));

// Domyślna trasa testowa, żeby Vercel nie wypluwał pustego ekranu (Cannot GET /)
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: "Serwer aplikacji BROSY działa poprawnie w chmurze!" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serwer działa publicznie na porcie ${PORT}`);
});

module.exports = app;

