const mongoose = require('mongoose');

// Definiujemy jak strukturalnie ma wyglądać każda pojedyncza ocena piwa w bazie
const BeerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, // Łączymy piwo z unikalnym ID użytkownika z bazy
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true, // Nazwa piwa jest obowiązkowa
  },
  alcohol: {
    type: Number,
    required: true, // Procent alkoholu jest obowiązkowy
  },
  volume: {
    type: Number,
    required: true, // Pojemność (ml) jest obowiązkowa
  },
  price: {
    type: Number,
    required: true, // Cena jest obowiązkowa
  },
  rating: {
    type: Number,
    required: true, // Ocena 1-10 jest obowiązkowa
  },
  description: {
    type: String, // Opis degustacyjny jest opcjonalny
    default: "",
  },
  image: {
    type: String, // Tutaj będziemy trzymać link tekstowy do zdjęcia na serwerze
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatycznie zapisze datę dodania oceny
  }
});

module.exports = mongoose.model('Beer', BeerSchema);
