export const useIsBridgeNeeded = (
	inputChainId: number | undefined,
	outputChainId: number | undefined
): {
	isBridgeNeeded: boolean;
} => {
	// Zap is needed if we are depositing and ...
	const isBridgeNeeded =
		// We indeed have a input chain id ...
		!!inputChainId &&
		// ... and the output chain id is also defined ...
		!!outputChainId &&
		// ... and we are trying to deposit token into vault on other chain
		inputChainId !== outputChainId;

	return {isBridgeNeeded};
};
