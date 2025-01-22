cd src/contracts/
aztec-nargo compile
aztec codegen -o src/artifacts target
cd ../../
./deployment_command.sh | python3 generate_config.py
