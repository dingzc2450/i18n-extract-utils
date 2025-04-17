import { useTranslations } from "next-intl";
const SearchForm = () => {const { t } = useTranslations();
  return <input className="w-52" placeholder={t(1)} />;
};

export default SearchForm;