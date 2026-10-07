export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo${small ? ' small' : ''}`}>
      <img className="logo-img" src="/icon-192.png" alt="" width={192} height={192} />
      <span className="logo-text">
        Dessineo <span className="logo-accent">Ary !</span>
      </span>
    </div>
  );
}

/** Grand logo de la page d'accueil */
export function HeroLogo() {
  return (
    <img className="hero-logo" src="/DessineoAry.png" alt="Dessineo Ary !" width={487} height={512} />
  );
}
