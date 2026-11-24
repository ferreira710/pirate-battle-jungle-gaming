interface PaginationProps {
	label: string;
	page: number;
	totalPages: number;
	busy: boolean;
	onChange: (page: number) => void;
	testId: string;
}

export function Pagination({
	label,
	page,
	totalPages,
	busy,
	onChange,
	testId,
}: PaginationProps) {
	if (totalPages <= 1) return null;

	return (
		<nav className="pagination" aria-label={label} data-testid={testId}>
			<button
				type="button"
				className="pager-btn"
				onClick={() => onChange(page - 1)}
				disabled={page <= 1}
				data-testid={`${testId}-prev`}
			>
				Previous
			</button>
			<p
				className="pagination__status"
				aria-live="polite"
				aria-busy={busy || undefined}
			>
				Page <span data-testid={`${testId}-page`}>{page}</span> of {totalPages}
			</p>
			<button
				type="button"
				className="pager-btn"
				onClick={() => onChange(page + 1)}
				disabled={page >= totalPages}
				data-testid={`${testId}-next`}
			>
				Next
			</button>
		</nav>
	);
}
