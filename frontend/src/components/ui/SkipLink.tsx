export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a data-testid="skip-to-content" href={`#${targetId}`} className="skip-link">
      Saltar para o conteúdo
    </a>
  );
}
