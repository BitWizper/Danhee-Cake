import HeroSection from '../components/home/HeroSection';
import CategoriesSection from '../components/home/CategoriesSection';
import FeaturedCakes from '../components/home/FeaturedCakes';
import HowItWorks from '../components/home/HowItWorks';

const HomePage = () => (
  <main id="home-page">
    <HeroSection />
    <CategoriesSection />
    <FeaturedCakes />
    <HowItWorks />
  </main>
);

export default HomePage;
